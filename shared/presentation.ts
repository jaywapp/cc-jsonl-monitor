import type { EventDetail, EventKind } from './types.js';

type RecordValue = Record<string, unknown>;
export const object = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const str = (value: unknown): string => typeof value === 'string' ? value : '';
const own = (map: Record<string, string>, key: string): string | undefined => Object.hasOwn(map, key) ? map[key] : undefined;

const labels: Record<string, string> = {
  payload: '추가 정보', checkedFiles: '확인한 파일', note: '메모', options: '옵션', type: '기록 형식', subtype: '세부 형식', data: '진행 정보', message: '메시지', content: '내용', text: '내용',
  summary: '요약', description: '설명', title: '제목', name: '이름', status: '상태', operation: '대기열 동작',
  command: '명령', file_path: '파일 경로', filePath: '파일 경로', path: '경로', cwd: '작업 폴더',
  output: '실행 출력', stdout: '표준 출력', stderr: '오류 출력', result: '결과', error: '오류 내용',
  elapsedTimeSeconds: '경과 시간(초)', elapsed_time_seconds: '경과 시간(초)', duration_ms: '소요 시간(ms)',
  durationMs: '소요 시간(ms)', duration_api_ms: 'API 소요 시간(ms)', exit_code: '종료 코드', exitCode: '종료 코드',
  hookName: '훅 이름', hook_name: '훅 이름', hookEvent: '훅 실행 계기', hook_event: '훅 실행 계기',
  agentName: '에이전트 이름', agentId: '에이전트 ID', agent_id: '에이전트 ID', prompt: '요청 내용',
  tool_name: '도구', toolName: '도구', toolUseID: '호출 ID', tool_use_id: '호출 ID', parentToolUseID: '상위 호출 ID',
  model: '모델', version: '버전', claude_code_version: 'Claude Code 버전', permissionMode: '권한 모드',
  tools: '사용 가능한 도구', mcp_servers: 'MCP 서버', skills: '스킬', plugins: '플러그인',
  compact_metadata: '압축 정보', compactMetadata: '압축 정보', trigger: '실행 계기', pre_tokens: '압축 전 토큰',
  total_cost_usd: '비용(USD)', num_turns: '대화 차례', usage: '사용량', input_tokens: '입력 토큰', output_tokens: '출력 토큰',
  cache_read_input_tokens: '캐시에서 읽은 토큰', cache_creation_input_tokens: '캐시에 저장한 토큰',
  attachment: '첨부 내용', prUrl: 'PR 주소', prNumber: 'PR 번호', prRepository: '저장소', snapshot: '파일 이력', trackedFileBackups: '기록된 파일', backupFileName: '백업 파일', backupTime: '백업 시각',
  isSnapshotUpdate: '이력 갱신 여부', timestamp: '기록 시각', customTitle: '세션 이름', agentColor: '에이전트 색상',
  tag: '태그', lastPrompt: '마지막 요청', task_id: '작업 ID', task_type: '작업 종류', notification: '알림',
  outcome: '처리 결과', reason: '사유', retryInMs: '재시도 대기(ms)', attempt: '시도 횟수', maxRetries: '최대 재시도',
  url: '주소', media_type: '미디어 형식', mimeType: '미디어 형식', source: '첨부 정보',
  old_string: '변경 전 내용', new_string: '변경 후 내용', pattern: '검색 패턴', query: '검색어',
  todos: '할 일', activeForm: '진행 중 작업', input: '입력 항목', event: '스트리밍 정보', delta: '추가된 내용',
};
const states: Record<string, string> = {
  running: '진행 중', in_progress: '진행 중', pending: '대기 중', queued: '대기 중', started: '시작',
  completed: '완료', success: '성공', failed: '실패', error: '오류', cancelled: '취소됨',
  enqueue: '요청 추가', dequeue: '요청 꺼내기', remove: '요청 제거', manual: '사용자 실행', auto: '자동 실행',
};
const hidden = new Set(['uuid', 'parentUuid', 'leafUuid', 'messageId', 'sessionId', 'session_id', 'isSidechain', 'userType', 'requestId', 'signature']);
const secret = /api[_-]?key|token|secret|password|authorization|credential/i;

export interface Presentation {
  kind: EventKind;
  title?: string;
  text: string;
  details: EventDetail[];
  partial?: boolean;
  truncated?: boolean;
}

function classification(record: RecordValue, block: RecordValue, role: string | null): { kind: EventKind; title?: string; partial?: boolean } {
  const type = str(record.type);
  const subtype = str(record.subtype);
  const blockType = str(block.type);
  if (['tool_use', 'tool_result', 'thinking'].includes(blockType)) return { kind: blockType as EventKind };
  if (blockType === 'image' || blockType === 'document') return { kind: 'system', title: blockType === 'image' ? '첨부 이미지' : '첨부 문서' };
  if (blockType === 'redacted_thinking') return { kind: 'thinking', title: '비공개 생각 기록' };
  if (type === 'summary' || type === 'tool_use_summary' || subtype === 'compact_boundary') return { kind: 'summary', title: subtype === 'compact_boundary' ? '대화 압축' : type === 'tool_use_summary' ? '도구 작업 요약' : '대화 요약' };
  if (type === 'file-history-snapshot' || type === 'file_history_snapshot' || type === 'files_persisted') return { kind: 'file_history', title: '파일 이력' };
  if (type === 'attachment') return { kind: 'system', title: '첨부 정보' };
  if (type === 'rate_limit_event') return { kind: 'system', title: '사용 한도 안내' };
  if (type === 'auth_status') return { kind: 'session', title: '인증 상태' };
  if (type === 'queue-operation') return { kind: 'progress', title: '요청 대기열' };
  if (['last-prompt', 'custom-title', 'tag', 'agent-name', 'agent-color', 'session-state', 'session_state_changed', 'pr-link'].includes(type)) return { kind: 'session', title: '세션 정보' };
  if (['progress', 'tool_progress', 'task_progress', 'stream_event'].includes(type) || ['task_started', 'task_progress', 'task_notification', 'task_updated', 'hook_started', 'hook_progress', 'hook_response'].includes(subtype)) {
    const progressType = str(object(record.data).type) || subtype || type;
    const titles: Record<string, string> = { bash_progress: '명령 실행 중', agent_progress: '에이전트 진행 상황', hook_progress: '훅 진행 상황', mcp_progress: 'MCP 도구 진행 상황', tool_progress: '도구 실행 중', task_started: '작업 시작', task_notification: '작업 알림', hook_started: '훅 시작', hook_response: '훅 처리 결과', stream_event: '응답 수신 중' };
    return { kind: 'progress', title: own(titles, progressType) ?? '진행 상황' };
  }
  if (type === 'result') return { kind: 'system', title: record.is_error === true || subtype.startsWith('error') ? '실행 오류' : subtype === 'success' ? '실행 완료' : '실행 결과' };
  if (role === 'user' || role === 'assistant' || role === 'system') {
    if (blockType && !['text', 'user', 'assistant', 'system'].includes(blockType)) return { kind: 'unknown', partial: true };
    const titles: Record<string, string> = { init: '세션 시작', turn_duration: '응답 소요 시간', api_error: 'API 요청 오류', local_command: '로컬 명령', local_command_output: '로컬 명령 결과', stop_hook_summary: '종료 훅 결과', status: '상태 변경', bridge_status: '연결 상태' };
    return { kind: role, ...(own(titles, subtype) ? { title: own(titles, subtype) } : {}) };
  }
  return { kind: 'unknown', partial: true };
}

// A bounded projection of JSON values, never a serialized record. The same
// projection powers the browser worker, local server, search, and event cards.
export function present(record: RecordValue, value: unknown, role: string | null, maxChars: number): Presentation {
  const block = object(value);
  const classified = classification(record, block, role);
  const details: EventDetail[] = [];
  let remaining = maxChars;
  let truncated = false;
  let visited = 0;
  const take = (text: string, max = remaining) => {
    const result = text.slice(0, Math.min(remaining, max));
    if (text.length > result.length) truncated = true;
    remaining -= result.length;
    return result;
  };
  const title = classified.title ? take(classified.title) : undefined;
  const add = (label: string, text: string, sensitive = false) => {
    if (details.length >= 24 || remaining <= label.length) { truncated = true; return; }
    details.push({ label: take(label, 180), value: take(text, 2000), ...(sensitive ? { sensitive: true } : {}) });
  };
  function walk(item: unknown, label: string, depth = 0, sensitive = false, key = ''): void {
    if (++visited > 256 || details.length >= 24 || remaining <= 0) { truncated = true; return; }
    if (typeof item === 'string') {
      if (!item.trim()) return;
      if (/^(?:data:[^,]+;base64,|[A-Za-z0-9+/=\r\n]{256,}$)/.test(item) || key === 'signature') { add(label, '인코딩된 내용은 표시하지 않습니다.'); return; }
      if (/^\s*[\[{]/.test(item)) {
        try {
          const decoded: unknown = JSON.parse(item);
          if (decoded !== null && typeof decoded === 'object') {
            if (depth >= 5) { add(label, '중첩된 내용이 더 있습니다.'); truncated = true; return; }
            walk(decoded, label, depth + 1, sensitive); return;
          }
        } catch { /* Ordinary prose or code is preserved as text. */ }
      }
      const translated = ['status', 'operation', 'trigger', 'outcome'].includes(key) ? own(states, item) ?? item : item;
      add(label, translated, sensitive); return;
    }
    if (item === null) { add(label, '값 없음', sensitive); return; }
    if (typeof item === 'boolean' || typeof item === 'number') { add(label, typeof item === 'boolean' ? item ? '예' : '아니요' : String(item), sensitive); return; }
    if (typeof item !== 'object') return;
    if (depth >= 5) { add(label, '중첩된 내용이 더 있습니다.', sensitive); truncated = true; return; }
    if (Array.isArray(item)) {
      if (!item.length) { add(label, '항목 없음'); return; }
      for (let index = 0; index < item.length; index++) {
        if (details.length >= 24 || visited > 256 || remaining <= 0) { truncated = true; break; }
        walk(item[index], `${label} · ${index + 1}`, depth + 1, sensitive);
      }
      return;
    }
    const entries = Object.entries(item);
    const encoded = object(item).type === 'base64';
    if (!entries.length) { add(label || '내용', '항목 없음'); return; }
    for (const [field, child] of entries) {
      if (hidden.has(field)) continue;
      if (encoded && field === 'data') { add('첨부 내용', '인코딩된 내용은 표시하지 않습니다.'); continue; }
      if (details.length >= 24 || visited > 256 || remaining <= 0) { truncated = true; break; }
      const name = own(labels, field) ?? (/[./\\]/.test(field) ? field : field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' '));
      walk(child, label ? `${label} / ${name}` : name, depth + 1, sensitive || secret.test(field) && !/tokens$/.test(field), field);
    }
  }

  let text = '';
  const normalText = value === record ? null : typeof value === 'string' ? value : typeof block.text === 'string' ? block.text : typeof block.thinking === 'string' ? block.thinking : null;
  if (block.type === 'redacted_thinking') text = take('이 생각 기록은 비공개로 저장되어 내용을 읽을 수 없습니다.');
  else if (classified.kind === 'tool_use') {
    text = take('도구에 전달한 입력입니다.'); walk(block.input ?? {}, '');
  } else if (classified.kind === 'tool_result') {
    const content = block.content;
    if (typeof content === 'string' && !/^\s*[\[{]/.test(content)) text = take(content);
    else {
      text = take('도구가 반환한 결과입니다.');
      if (Array.isArray(content)) for (const part of content) {
        if (details.length >= 24 || remaining <= 0 || visited > 256) { truncated = true; break; }
        const entry = object(part);
        walk(entry.type === 'text' ? entry.text : part, '결과');
      }
      else walk(content, '결과');
    }
  } else if (normalText !== null && !/^\s*[\[{]/.test(normalText)) text = take(normalText);
  else if (normalText !== null) {
    // Structured text is rendered as fields; actual source snippets remain prose.
    try { const parsed: unknown = JSON.parse(normalText); walk(parsed, '내용'); }
    catch { text = take(normalText); }
  } else {
    const descriptions: Partial<Record<EventKind, string>> = {
      summary: '대화를 이어가기 위한 요약 정보입니다.', file_history: '이 시점에 기록된 파일 백업 정보입니다. 실제 변경 내용과는 다를 수 있습니다.',
      progress: '작업 중 보고된 상태입니다.', session: '세션에 저장된 이름과 설정 정보입니다.', system: '실행 환경과 상태에 관한 기록입니다.',
      unknown: '확인 가능한 항목을 정리했습니다.',
    };
    const primary = value === record ? ['summary', 'text', 'content', 'description', 'lastPrompt'].find(field => typeof record[field] === 'string' && (record[field] as string).trim() && !/^\s*[\[{]/.test(record[field] as string)) : undefined;
    text = take(primary ? record[primary] as string : descriptions[classified.kind] ?? '기록에 포함된 정보입니다.');
    const payload = value === record ? record : value;
    if (payload === record) {
      // Show useful human content before envelope bookkeeping.
      const priority = ['summary', 'text', 'content', 'message', 'data', 'snapshot', 'result', 'error', 'description', 'customTitle', 'lastPrompt'];
      for (const field of priority) if (field !== primary && Object.hasOwn(record, field)) walk(record[field], own(labels, field) ?? field, 0, secret.test(field), field);
      const rest = Object.fromEntries(Object.entries(record).filter(([field]) => field !== primary && !priority.includes(field) && !hidden.has(field) && !['type', 'timestamp', 'cwd'].includes(field)));
      if (Object.keys(rest).length) walk(rest, '');
    } else walk(payload, '');
  }
  if (classified.partial && value !== record && normalText !== null) {
    const extra = Object.fromEntries(Object.entries(block).filter(([field]) => !['type', 'text', 'thinking'].includes(field)));
    if (Object.keys(extra).length) walk(extra, '');
  }
  if (classified.partial && typeof record.type === 'string') add('기록 형식', record.type);
  return { ...classified, title, text, details, ...(truncated ? { truncated: true } : {}) };
}
