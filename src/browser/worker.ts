import { BrowserFiles, fileError, type Handle } from './filesystem';
const files = new BrowserFiles();
interface Request { id: number; action: string; source?: string; path?: string; query?: string; handle?: Handle; }
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage(message: unknown): void };
scope.onmessage = async ({ data }) => {
  const { id, action, source = '', path = '' } = data;
  try {
    const params = new URLSearchParams(data.query);
    let result: unknown;
    switch (action) {
      case 'register': result = files.register(source, data.handle!); break;
      case 'clear': files.clear(); break;
      case 'entry': result = await files.entry(source, path); break;
      case 'tree': result = await files.tree(source, path); break;
      case 'file': result = await files.file(source, path, params); break;
      case 'revision': result = await files.revision(source, path); break;
      case 'raw': result = await files.raw(source, path, Number(params.get('line')), params.get('revision') || ''); break;
      default: throw new Error('지원하지 않는 요청입니다.');
    }
    scope.postMessage({ id, result });
  } catch (error) { scope.postMessage({ id, error: fileError(error) }); }
};
