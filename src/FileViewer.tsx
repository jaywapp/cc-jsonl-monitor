import { bindPreference, type ViewerPreferences } from './viewer-preferences';
import type { Dispatch, SetStateAction } from 'react';
import { EVENT_LABELS } from '../shared/event-labels';
import type { EventKind } from '../shared/types';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownUp, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Info, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { FileView, Source } from '../shared/types';
import { api, endpoint, messageOf } from './api';
import { formatBytes, formatTime } from './format';
import ConversationView from './ConversationView';
import EventCard from './EventCard';

interface Props { sidebarVisible: boolean; onToggleSidebar(): void; source: Source; path: string; name: string; preferences: ViewerPreferences; setPreferences: Dispatch<SetStateAction<ViewerPreferences>>; }

export default function FileViewer({ source, path, name, preferences, setPreferences, sidebarVisible, onToggleSidebar }: Props) {
  const [data, setData] = useState<FileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = bindPreference('query', preferences, setPreferences);
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [titles, setTitles] = bindPreference('titles', preferences, setPreferences);
  const [kind, setKind] = bindPreference('kind', preferences, setPreferences);
  const [session, setSession] = bindPreference('session', preferences, setPreferences);
  const [order, setOrder] = bindPreference('order', preferences, setPreferences);
  const [timezone, setTimezone] = bindPreference('timezone', preferences, setPreferences);
  const [from, setFrom] = bindPreference('from', preferences, setPreferences);
  const [to, setTo] = bindPreference('to', preferences, setPreferences);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [watching, setWatching] = bindPreference('watching', preferences, setPreferences);
  const [change, setChange] = useState('');
  const [watchError, setWatchError] = useState('');
  const [masked, setMasked] = bindPreference('masked', preferences, setPreferences);
  const [view, setView] = bindPreference('view', preferences, setPreferences);
  const scrollRef = useRef<HTMLDivElement>(null);
  const invalidDates = Boolean(from && to && from > to);
  const pageSize = 100;

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query); setOffset(0); }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (invalidDates) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    api<FileView>(endpoint('file', { source: source.id, path, q: debouncedQuery, titles: titles.join(','), kind, session, order, timezone, from, to, offset, limit: pageSize, refresh: reload }), { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (offset > 0 && offset >= result.matchedEvents) { setOffset(0); return; }
        setData(result); setChange(''); setWatchError('');
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(messageOf(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [source.id, path, debouncedQuery, titles, kind, session, order, timezone, from, to, offset, reload, invalidDates]);

  useEffect(() => {
    if (!watching || !data) return;
    const controller = new AbortController();
    let pending = false;
    const check = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const result = await api<{ revision: string; exists: boolean }>(endpoint('revision', { source: source.id, path }), { signal: controller.signal });
        if (!controller.signal.aborted) {
          setChange(!result.exists ? 'deleted' : result.revision !== data.revision ? 'changed' : '');
          setWatchError('');
        }
      } catch (reason) { if (!controller.signal.aborted) setWatchError(messageOf(reason)); }
      finally { pending = false; }
    };
    const timer = window.setInterval(() => void check(), 2500);
    const resume = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', resume);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); controller.abort(); };
  }, [watching, source.id, path, data?.revision]);

  function resetFilters() { setQuery(''); setDebouncedQuery(''); setKind('all'); setTitles(Object.keys(EVENT_LABELS) as EventKind[]); setSession(''); setFrom(''); setTo(''); setOffset(0); }
  function refresh() { setReload((value) => value + 1); }
  function page(next: number) { setOffset(next); scrollRef.current?.scrollTo({ top: 0 }); }
  const hasFilters = Boolean(titles.length !== Object.keys(EVENT_LABELS).length || query || kind !== 'all' || session || from || to);
  const timeLabel = timezone === 'utc' ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone;

  return <section className="file-view" aria-labelledby="file-title">
    <header className="session-heading">
      <button type="button" className="icon-button" aria-label={sidebarVisible ? '파일 탐색기 접기' : '파일 탐색기 펼치기'} title={sidebarVisible ? '파일 탐색기 접기' : '파일 탐색기 펼치기'} onClick={onToggleSidebar}>{sidebarVisible ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
      <h1 id="file-title" title={name}>{name}</h1>
      {data && <span className="session-count">{data.totalEvents.toLocaleString()}개 기록 · {data.sessionIds.length}개 세션</span>}
      <button className="secondary-button compact" type="button" aria-expanded={infoOpen} aria-controls="session-info" onClick={() => setInfoOpen(value => !value)}><Info size={14} />파일 정보</button>
      <button className="icon-button" type="button" aria-label="새로고침" title="새로고침" disabled={loading} onClick={refresh}><RefreshCw size={15} /></button>
    </header>
    <div className="session-info" id="session-info" hidden={!infoOpen}>
      <p className="full-path">{data?.filePath || source.path}</p>
      {data && <p>{formatBytes(data.size)} · 마지막 기록 {formatTime(data.lastTimestamp, timezone)}</p>}
      <p>워크스페이스: {data?.cwdPaths.length ? data.cwdPaths.join(' · ') : '경로 미확인 · 파일 기준으로 표시합니다.'}</p>
    </div>

    <div className="reader-controls">
      <div className="primary-filters">
        <div className="search-control"><label className="sr-only" htmlFor="content-search">선택한 파일에서 검색</label><Search size={17} /><input id="content-search" type="search" placeholder="이 파일에서 요청, 도구, 내용 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>

        <label className="select-field order-control"><ArrowDownUp size={15} /><span className="sr-only">시간 정렬</span><select aria-label="시간 정렬" value={order} onChange={(event) => { setOrder(event.target.value); setOffset(0); }}><option value="asc">과거 → 최신</option><option value="desc">최신 → 과거</option></select></label>
        <button type="button" className="secondary-button compact filter-toggle" aria-expanded={filtersOpen} aria-controls="advanced-filters" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={14} />필터·설정{hasFilters && <span>적용 중</span>}</button>
        {hasFilters && <button className="text-button" type="button" onClick={resetFilters}>초기화</button>}
        <div className="view-switch" role="group" aria-label="기록 보기 방식"><button type="button" aria-pressed={view === 'conversation'} onClick={() => setView('conversation')}>대화형</button><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>목록형</button></div>
      </div>
      <div className="filter-panel" id="advanced-filters" hidden={!filtersOpen}>
      <fieldset className="title-filters"><legend>기록 제목 <span className="filter-hint">여러 개 선택 가능</span></legend><button type="button" className="title-filter" aria-pressed={titles.length === Object.keys(EVENT_LABELS).length} onClick={() => { setTitles(Object.keys(EVENT_LABELS) as EventKind[]); setOffset(0); }}>전체</button><button type="button" className="title-filter" onClick={() => { setTitles([]); setOffset(0); }}>선택 해제</button>{(Object.keys(EVENT_LABELS) as EventKind[]).map(title => <button type="button" key={title} className="title-filter" aria-pressed={titles.includes(title)} onClick={() => { setTitles(old => old.includes(title) ? old.filter(value => value !== title) : [...old, title]); setOffset(0); }}>{EVENT_LABELS[title]}<span>{data?.counts[title] ?? 0}</span></button>)}</fieldset>
      <div className="secondary-filters"><label className="select-field"><span className="sr-only">오류 필터</span><select aria-label="오류 필터" value={kind} onChange={(event) => { setKind(event.target.value); setOffset(0); }}><option value="all">전체 상태</option><option value="error">오류만</option></select></label><div className="date-range"><label>시작일<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setOffset(0); }} /></label><span aria-hidden="true">–</span><label>종료일<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setOffset(0); }} /></label></div>
        <select className="timezone-select" aria-label="표시 시간대" value={timezone} onChange={(event) => { setTimezone(event.target.value); setOffset(0); }}><option value="local">내 시간대</option><option value="utc">UTC</option></select>
        {data && (data.sessionIds.length > 1 || session) && <select className="session-select" aria-label="세션 필터" value={session} onChange={(event) => { setSession(event.target.value); setOffset(0); }}><option value="">모든 세션</option>{session && !data.sessionIds.includes(session) && <option value={session}>{session} · 이 파일에 없음</option>}{data.sessionIds.map((id) => <option key={id} value={id}>{id}</option>)}</select>}

      </div>
      <div className="view-options"><label title="인식 가능한 키와 토큰을 가립니다. 완전한 탐지를 보장하지 않습니다."><input type="checkbox" checked={masked} onChange={(event) => setMasked(event.target.checked)} /><ShieldCheck size={14} />민감 값 가리기</label><label><input type="checkbox" checked={watching} onChange={(event) => setWatching(event.target.checked)} />변경 확인</label></div>
      </div>
      {invalidDates && <p className="error-text" role="alert">시작일은 종료일보다 늦을 수 없습니다.</p>}
    </div>


    {change && <div className="update-banner" role="status"><span>{change === 'deleted' ? '원본 파일이 없어졌습니다. 현재 화면은 마지막으로 읽은 기록입니다.' : '파일에 새 기록이 추가되거나 내용이 변경되었습니다.'}</span><button type="button" onClick={refresh} disabled={loading}>다시 읽기</button></div>}
    {watchError && <div className="notice warning" role="status">변경 확인을 잠시 수행하지 못했습니다. {watchError}</div>}

    <div className="timeline-scroll" ref={scrollRef} aria-busy={loading}>
      {error ? <div className="content-error" role="alert"><AlertCircle size={30} /><h2>파일을 읽지 못했습니다</h2><p>{error}</p><button className="secondary-button" type="button" onClick={refresh}>다시 시도</button></div> : !data ? <div className="loading-state" role="status">{!invalidDates && <><div className="skeleton-line" /><div className="skeleton-line short" /></>}<p>{invalidDates ? '기간을 수정하면 기록을 표시합니다.' : 'JSONL 기록을 읽고 있습니다.'}</p></div> : <>
        {(data.diagnostics.length > 0 || data.pendingTail || data.truncated) && <details className="diagnostics"><summary><AlertCircle size={15} />읽기 상태 확인{data.diagnostics.length > 0 ? ` · 진단 ${data.diagnostics.length}개` : ''}{data.pendingTail ? ' · 마지막 줄 대기' : ''}</summary><div>{data.pendingTail && <p>마지막 줄이 아직 완성되지 않았습니다. 파일 변경 후 다시 읽으면 이어진 기록을 확인할 수 있습니다.</p>}{data.truncated && <p>처리 한도 때문에 일부 기록만 표시되었습니다.</p>}<ul>{data.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.line}-${index}`}>{diagnostic.line > 0 ? `${diagnostic.line}번째 줄 · ` : ''}{diagnostic.message}</li>)}</ul></div></details>}
        {data.events.length === 0 ? <div className="content-empty"><Search size={32} strokeWidth={1.3} /><h2>{data.totalEvents ? '조건에 맞는 기록이 없습니다' : '표시할 기록이 없습니다'}</h2><p>{data.totalEvents ? '파일을 바꿔도 검색·필터는 유지됩니다. 조건을 바꾸거나 초기화해 보세요.' : '비어 있거나 지원 가능한 기록이 없는 파일입니다. 진단이 있다면 함께 확인하세요.'}</p>{hasFilters && <button className="secondary-button" type="button" onClick={resetFilters}>검색·필터 초기화</button>}</div> : view === 'conversation' ? <ConversationView key={data.revision} events={data.events} timezone={timezone} masked={masked} filtered={hasFilters} /> : <div className="events-list">{data.events.map((event) => <EventCard key={`${data.revision}:${event.id}`} event={event} timezone={timezone} masked={masked} />)}</div>}
      </>}
    </div>
    {data && <footer className="pagination"><span className="result-count" role="status">{loading ? '기록 읽는 중…' : data.matchedEvents.toLocaleString() + '개 일치'} · {timeLabel}</span><span>{data.matchedEvents ? `${offset + 1}–${Math.min(offset + data.events.length, data.matchedEvents)} / ${data.matchedEvents.toLocaleString()}` : '0개 기록'}<span className="pagination-note"> · 페이지당 {pageSize}개</span></span><div><button type="button" className="icon-button" aria-label="이전 페이지" disabled={offset === 0 || loading} onClick={() => page(Math.max(0, offset - pageSize))}><ChevronLeft size={18} /></button><span>{Math.floor(offset / pageSize) + 1} / {Math.max(1, Math.ceil(data.matchedEvents / pageSize))}</span><button type="button" className="icon-button" aria-label="다음 페이지" disabled={offset + pageSize >= data.matchedEvents || loading} onClick={() => page(offset + pageSize)}><ChevronRight size={18} /></button></div></footer>}
  </section>;
}
