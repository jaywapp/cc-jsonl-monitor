export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTime(value: string | null | undefined, timezone = 'local', dateOnly = false): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '시각 미상';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    ...(timezone === 'utc' ? { timeZone: 'UTC' } : {}),
  }).format(new Date(value));
}

export function redact(text: string, enabled: boolean): string {
  if (!enabled) return text;
  return text
    .replace(/\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|AKIA[A-Z0-9]{16})\b/g, '[가림]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, '$1[가림]')
    .replace(/((?:api[_-]?key|access[_-]?token|secret|password)\s*["']?\s*[:=]\s*["']?)([^\s"',}\n]{4,})/gi, '$1[가림]');
}
