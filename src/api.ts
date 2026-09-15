import { isExtension, browserApi } from './browser/client';
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  if (isExtension) return browserApi<T>(url, options.signal ?? undefined);
  const response = await fetch(url, {
    ...options,
    headers: { 'X-Viewer-Request': '1', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({ error: '서버 응답을 읽을 수 없습니다. 로컬 서버 실행 상태를 확인해 주세요.' }));
  if (!response.ok) throw new Error(data.error || '기록을 불러오지 못했습니다.');
  return data as T;
}

export function endpoint(name: string, values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && (value !== '' || key === 'titles')) query.set(key, String(value)); });
  return `/api/${name}?${query}`;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}
