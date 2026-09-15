import { useEffect, useState } from 'react';
import { ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react';
import type { WorkAnalysis } from '../shared/analysis';
import type { TranscriptEvent } from '../shared/types';
import { EVENT_LABELS } from '../shared/event-labels';
import { api, endpoint, messageOf } from './api';
import { formatTime, redact } from './format';

interface Props { source: string; path: string; revision: string; masked: boolean; timezone: string; onClose(): void; }
function preview(text: string, masked: boolean) {
  const safe = redact(text, masked);
  return safe.length > 220 ? safe.slice(0, 220) + '…' : safe;
}
function Evidence({ events, masked, timezone }: { events: TranscriptEvent[]; masked: boolean; timezone: string }) {
  return <details className="analysis-evidence"><summary>근거 기록 {events.length}개 보기</summary><ol>{events.map((event, index) => <li key={index}>
    <strong>{event.line}번째 줄{event.blockIndex ? ` · 항목 ${event.blockIndex + 1}` : ''} · {EVENT_LABELS[event.kind]}{event.isError ? ' · 오류' : ''}</strong>
    <time>{formatTime(event.timestamp, timezone)}</time>
    <p>{preview(event.text, masked)}</p>
    {!!event.details?.length && <dl>{event.details.slice(0, 4).map((field, fieldIndex) => <div key={fieldIndex}><dt>{preview(field.label, masked)}</dt><dd>{field.sensitive && masked ? '[가림]' : preview(field.value, masked)}</dd></div>)}</dl>}
    {(event.details?.length ?? 0) > 4 && <p className="analysis-note">처음 4개 항목만 표시합니다. 전체 항목은 대화에서 확인할 수 있습니다.</p>}
  </li>)}</ol></details>;
}
export default function AnalysisPanel({ source, path, revision, masked, timezone, onClose }: Props) {
  const [data, setData] = useState<WorkAnalysis | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    api<WorkAnalysis>(endpoint('analysis', { source, path, revision }), { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(reason => { if (!controller.signal.aborted) setError(messageOf(reason)); });
    return () => controller.abort();
  }, [source, path, revision, attempt]);
  return <section className="analysis-panel" id="work-analysis" aria-labelledby="analysis-title" aria-busy={!data && !error}>
    <header className="analysis-heading"><div><h2 id="analysis-title">작업 패턴</h2><p>선택한 파일 전체 · 검색·필터와 페이지 범위에 영향받지 않습니다.</p></div><button type="button" className="secondary-button compact" onClick={onClose}><ArrowLeft size={14} />대화로 돌아가기</button></header>
    {error ? <div className="content-error" role="alert"><AlertCircle size={28} /><p>{error}</p><button type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14} />분석 다시 시도</button></div> : !data ? <div className="loading-state" role="status"><div className="skeleton-line" /><p>파일 전체에서 작업 패턴을 찾고 있습니다.</p></div> : data.totalEvents === 0 ? <div className="content-empty"><h3>분석할 기록이 없습니다</h3><p>대화로 돌아가 파일의 읽기 상태를 확인하세요.</p></div> : <>
      <p className="analysis-summary">{data.totalEvents.toLocaleString()}개 기록 · 사용자 요청 {data.requests}개 · 응답 블록 {data.responses}개 · 도구 호출 {data.toolCalls}회 · 오류 표시 {data.errors}개</p>
      <p className="analysis-note">기록 시각 범위: {formatTime(data.firstTimestamp, timezone)} ~ {formatTime(data.lastTimestamp, timezone)}. 실제 작업 시간이나 완료 여부를 뜻하지 않습니다.</p>
      <details className="analysis-coverage"><summary>분석 기준과 기록 상태{data.diagnostics || data.pendingTail || data.partialEvents || data.missingSessions ? ' · 제한 있음' : ''}</summary>
        <p>외부 AI 호출 없이 기록 순서와 도구·표시 입력을 비교합니다. 요청 이후 흐름은 같은 세션의 다음 요청 전까지 파일에 나타난 기록입니다. 병렬 작업의 실제 인과관계나 사용자의 의도는 추정하지 않습니다.</p>
        <p>확인된 세션 {data.sessions}개 · 세션 미상 {data.missingSessions}개 · 시각 미상 {data.missingTimes}개 · 일부만 해석된 기록 {data.partialEvents}개 · 읽지 못한 행 {data.diagnostics}개{data.pendingTail ? ' · 미완성 마지막 줄 제외' : ''}</p>
        <p>세션 미상 기록은 흐름·반복·재시도 연결에서 제외합니다. 생략되거나 미해석된 입력은 반복 비교에서 제외합니다. 결과 연결이 없는 호출은 실패로 계산하지 않습니다.</p>
      </details>
      <div className="analysis-columns">
        <section aria-labelledby="patterns-title"><h3 id="patterns-title">반복과 재시도 후보 <span>{data.totalPatterns}개</span></h3>
          {data.patterns.length === 0 ? <p className="analysis-note">같은 요청 구간에서 3회 이상 반복된 표시 입력이나, 연결된 오류 결과 뒤의 동일 호출을 찾지 못했습니다.</p> : <ol className="pattern-list">{data.patterns.map((pattern, index) => <li key={index}>
            <h4>{preview(pattern.tool, masked)} · {pattern.kind === 'repeat' ? `같은 표시 입력 ${pattern.count}회` : '오류 뒤 같은 호출'}</h4>
            <p>{pattern.kind === 'repeat' ? '같은 세션·요청 구간에서 도구와 표시 입력이 같습니다. 반복 확인이나 정상적인 반복 작업일 수도 있습니다.' : '연결된 오류 결과 다음에 같은 도구와 표시 입력이 다시 나타났습니다. 재시도 여부와 이후 결과는 근거를 확인하세요.'}</p>
            <p className="analysis-session">세션 {preview(pattern.sessionId, masked)}</p>
            <Evidence events={pattern.evidence} masked={masked} timezone={timezone} />
          </li>)}</ol>}
          {data.totalPatterns > data.patterns.length && <p className="analysis-note">후보 {data.totalPatterns}개 중 20개 표시. 오류 뒤 호출을 먼저, 반복은 횟수순으로 표시합니다.</p>}
        </section>
        <section aria-labelledby="tools-title"><h3 id="tools-title">도구 사용</h3><p className="analysis-note">오류는 해당 호출에 연결된 결과의 오류 표시입니다.</p>
          {data.tools.length === 0 ? <p className="analysis-note">도구 호출 기록이 없습니다.</p> : <table className="analysis-tools"><thead><tr><th>도구</th><th>호출</th><th>결과 연결</th><th>오류</th><th>연결 미확정</th></tr></thead><tbody>{data.tools.map(tool => <tr key={tool.name}><th>{preview(tool.name, masked)}</th><td>{tool.calls}</td><td>{tool.linkedResults}</td><td>{tool.errors}</td><td>{tool.unlinked}</td></tr>)}</tbody></table>}
          {data.totalTools > data.tools.length && <p className="analysis-note">도구 {data.totalTools}종 중 호출이 많은 20종 표시.</p>}
        </section>
      </div>
      <section className="analysis-flows" aria-labelledby="flows-title"><h3 id="flows-title">요청 이후 흐름 <span>{data.totalFlows}개</span></h3><p className="analysis-note">파일에 기록된 순서이며, 요청 하나의 전체 작업 결과라고 단정할 수 없습니다.</p>
        {data.flows.length === 0 ? <p>세션을 확인할 수 있는 사용자 요청이 없습니다.</p> : <ol>{data.flows.map(flow => <li key={flow.request.id}>
          <p className="flow-request">{preview(flow.request.text, masked) || '텍스트 없는 요청'}</p>
          <p className="analysis-note">{flow.request.line}–{flow.lastLine}번째 줄 · 도구 {flow.calls}회 → 응답 블록 {flow.responses}개 · 오류 표시 {flow.errors}개</p>
          <p className="analysis-session">세션 {preview(flow.request.sessionId || '', masked)}</p>
          <Evidence events={[flow.request]} masked={masked} timezone={timezone} />
        </li>)}</ol>}
        {data.totalFlows > data.flows.length && <p className="analysis-note">요청 흐름 {data.totalFlows}개 중 파일 순서대로 처음 20개 표시.</p>}
      </section>
    </>}
  </section>;
}
