import type { EventKind } from './types.js';
export const EVENT_LABELS: Record<EventKind, string> = {
  user: '사용자 요청', assistant: 'Claude', tool_use: '도구 호출', tool_result: '도구 결과',
  thinking: '생각 기록', system: '시스템', unknown: '미지원 기록',
};
