import type { EventKind } from './types.js';
export const EVENT_LABELS: Record<EventKind, string> = {
  user: '사용자 요청', assistant: 'Claude', tool_use: '도구 호출', tool_result: '도구 결과',
  thinking: '생각 기록', system: '시스템', progress: '진행 상황', summary: '대화 요약', file_history: '파일 이력', session: '세션 정보', unknown: '기타 기록',
};
