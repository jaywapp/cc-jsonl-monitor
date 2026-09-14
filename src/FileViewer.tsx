import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownUp, ChevronLeft, ChevronRight, FileJson2, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import type { FileView, Source } from '../shared/types';
import { api, endpoint, messageOf } from './api';
import { formatBytes, formatTime } from './format';
import EventCard from './EventCard';

interface Props { source: Source; path: string; name: string; }

export default function FileViewer({ source, path, name }: Props) {
  const [data, setData] = useState<FileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [session, setSession] = useState('');
  const [order, setOrder] = useState('asc');
  const [timezone, setTimezone] = useState('local');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [watching, setWatching] = useState(true);
  const [change, setChange] = useState('');
  const [watchError, setWatchError] = useState('');
  const [masked, setMasked] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const invalidDates = Boolean(from && to && from > to);
  const pageSize = 100;

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query); setOffset(0); }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (invalidDates) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    api<FileView>(endpoint('file', { source: source.id, path, q: debouncedQuery, kind, session, order, timezone, from, to, offset, limit: pageSize }), { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (offset > 0 && offset >= result.matchedEvents) { setOffset(0); return; }
        setData(result); setChange(''); setWatchError('');
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(messageOf(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [source.id, path, debouncedQuery, kind, session, order, timezone, from, to, offset, reload, invalidDates]);

  useEffect(() => {
    if (!watching || !data) return;
    const controller = new AbortController();
    let pending = false;
    const timer = window.setInterval(async () => {
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
    }, 2500);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [watching, source.id, path, data?.revision]);

  function resetFilters() { setQuery(''); setDebouncedQuery(''); setKind('all'); setSession(''); setFrom(''); setTo(''); setOffset(0); }
  function refresh() { setReload((value) => value + 1); }
  function page(next: number) { setOffset(next); scrollRef.current?.scrollTo({ top: 0 }); }
  const hasFilters = Boolean(query || kind !== 'all' || session || from || to);
  const timeLabel = timezone === 'utc' ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone;

  return <section className="file-view" aria-labelledby="file-title">
    <header className="content-heading">
      <div className="file-title-row"><div className="file-title-icon"><FileJson2 size={25} strokeWidth={1.5} /></div><div className="title-text"><h1 id="file-title">{name}</h1><p className="full-path" title={data?.filePath || source.path}>{data?.filePath || source.path}</p></div>
        <button className="secondary-button compact" type="button" disabled={loading} onClick={refresh}><RefreshCw size={15} />새로고침</button>
      </div>
      {data && <div className="file-facts"><span><strong>{data.totalEvents.toLocaleString()}</strong> 이벤트</span><span><strong>{data.sessionIds.length}</strong> 세션</span><span>{formatBytes(data.size)}</span><span>마지막 기록 {formatTime(data.lastTimestamp, timezone)}</span></div>}
      {data?.cwdPaths.length ? <p className="workspace-context"><span>워크스페이스</span><code title={data.cwdPaths.join('\n')}>{data.cwdPaths.join(' · ')}</code></p> : data ? <p className="workspace-context"><span>워크스페이스</span>경로 미확인 · 파일 기준으로 표시합니다.</p> : null}
    </header>

    <div className="filter-panel">
      <div className="primary-filters">
        <div className="search-control"><label className="sr-only" htmlFor="content-search">선택한 파일에서 검색</label><Search size={17} /><input id="content-search" type="search" placeholder="이 파일에서 요청, 도구, 내용 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <label className="select-field"><span className="sr-only">이벤트 종류</span><select aria-label="이벤트 종류" value={kind} onChange={(event) => { setKind(event.target.value); setOffset(0); }}><option value="all">전체 이벤트</option><option value="user">사용자 요청</option><option value="assistant">Claude 응답</option><option value="tools">도구 호출·결과</option><option value="error">오류</option><option value="thinking">생각 기록</option><option value="system">시스템</option><option value="unknown">미지원 기록</option></select></label>
        <label className="select-field order-control"><ArrowDownUp size={15} /><span className="sr-only">시간 정렬</span><select aria-label="시간 정렬" value={order} onChange={(event) => { setOrder(event.target.value); setOffset(0); }}><option value="asc">과거 → 최신</option><option value="desc">최신 → 과거</option></select></label>
      </div>
      <div className="secondary-filters"><div className="date-range"><label>시작일<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setOffset(0); }} /></label><span aria-hidden="true">–</span><label>종료일<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setOffset(0); }} /></label></div>
        <select className="timezone-select" aria-label="표시 시간대" value={timezone} onChange={(event) => { setTimezone(event.target.value); setOffset(0); }}><option value="local">내 시간대</option><option value="utc">UTC</option></select>
        {data && data.sessionIds.length > 1 && <select className="session-select" aria-label="세션 필터" value={session} onChange={(event) => { setSession(event.target.value); setOffset(0); }}><option value="">모든 세션</option>{data.sessionIds.map((id) => <option key={id} value={id}>{id}</option>)}</select>}
        {hasFilters && <button className="text-button reset-filters" type="button" onClick={resetFilters}><X size={13} />초기화</button>}
      </div>
      {invalidDates && <p className="error-text" role="alert">시작일은 종료일보다 늦을 수 없습니다.</p>}
    </div>

    <div className="timeline-control"><span className="result-count" role="status">{loading ? '기록 읽는 중…' : data ? `${data.matchedEvents.toLocaleString()}개 일치 · ${timeLabel}` : '파일 읽기'}</span><div className="view-options"><label title="인식 가능한 키와 토큰을 가립니다. 완전한 탐지를 보장하지 않습니다."><input type="checkbox" checked={masked} onChange={(event) => setMasked(event.target.checked)} /><ShieldCheck size={14} />민감 값 가리기</label><label><input type="checkbox" checked={watching} onChange={(event) => setWatching(event.target.checked)} />변경 확인</label></div></div>
    {change && <div className="update-banner" role="status"><span>{change === 'deleted' ? '원본 파일이 없어졌습니다. 현재 화면은 마지막으로 읽은 기록입니다.' : '파일에 새 기록이 추가되거나 내용이 변경되었습니다.'}</span><button type="button" onClick={refresh} disabled={loading}>다시 읽기</button></div>}
    {watchError && <div className="notice warning" role="status">변경 확인을 잠시 수행하지 못했습니다. {watchError}</div>}

    <div className="timeline-scroll" ref={scrollRef} aria-busy={loading}>
      {error ? <div className="content-error" role="alert"><AlertCircle size={30} /><h2>파일을 읽지 못했습니다</h2><p>{error}</p><button className="secondary-button" type="button" onClick={refresh}>다시 시도</button></div> : !data ? <div className="loading-state" role="status"><div className="skeleton-line" /><div className="skeleton-line short" /><p>JSONL 기록을 읽고 있습니다.</p></div> : <>
        {(data.diagnostics.length > 0 || data.pendingTail || data.truncated) && <details className="diagnostics"><summary><AlertCircle size={15} />읽기 상태 확인{data.diagnostics.length > 0 ? ` · 진단 ${data.diagnostics.length}개` : ''}{data.pendingTail ? ' · 마지막 줄 대기' : ''}</summary><div>{data.pendingTail && <p>마지막 줄이 아직 완성되지 않았습니다. 파일 변경 후 다시 읽으면 이어진 기록을 확인할 수 있습니다.</p>}{data.truncated && <p>처리 한도 때문에 일부 기록만 표시되었습니다.</p>}<ul>{data.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.line}-${index}`}>{diagnostic.line > 0 ? `${diagnostic.line}번째 줄 · ` : ''}{diagnostic.message}</li>)}</ul></div></details>}
        {data.events.length === 0 ? <div className="content-empty"><Search size={32} strokeWidth={1.3} /><h2>{data.totalEvents ? '조건에 맞는 기록이 없습니다' : '표시할 기록이 없습니다'}</h2><p>{data.totalEvents ? '검색어나 날짜, 이벤트 종류를 바꿔보세요.' : '비어 있거나 지원 가능한 기록이 없는 파일입니다. 진단이 있다면 함께 확인하세요.'}</p>{hasFilters && <button className="secondary-button" type="button" onClick={resetFilters}>검색·필터 초기화</button>}</div> : <div className="events-list">{data.events.map((event) => <EventCard key={`${data.revision}:${event.id}`} event={event} source={source} path={path} revision={data.revision} timezone={timezone} masked={masked} />)}</div>}
      </>}
    </div>
    {data && <footer className="pagination"><span>{data.matchedEvents ? `${offset + 1}–${Math.min(offset + data.events.length, data.matchedEvents)} / ${data.matchedEvents.toLocaleString()}` : '0개 기록'}<span className="pagination-note"> · 페이지당 {pageSize}개</span></span><div><button type="button" className="icon-button" aria-label="이전 페이지" disabled={offset === 0 || loading} onClick={() => page(Math.max(0, offset - pageSize))}><ChevronLeft size={18} /></button><span>{Math.floor(offset / pageSize) + 1} / {Math.max(1, Math.ceil(data.matchedEvents / pageSize))}</span><button type="button" className="icon-button" aria-label="다음 페이지" disabled={offset + pageSize >= data.matchedEvents || loading} onClick={() => page(offset + pageSize)}><ChevronRight size={18} /></button></div></footer>}
  </section>;
}
