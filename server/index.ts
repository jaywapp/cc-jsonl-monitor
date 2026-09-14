import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ViewerService, isWithin } from './service.js';
import { ViewerError, publicError } from './errors.js';

type Fallback = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

function checkRequest(request: IncomingMessage): void {
  const host = request.headers.host;
  const allowed = [`127.0.0.1:${request.socket.localPort}`, `localhost:${request.socket.localPort}`];
  if (!host || !allowed.includes(host)) throw new ViewerError(403, '로컬 앱 주소에서만 접근할 수 있습니다.');
  const origin = request.headers.origin;
  if (origin && origin !== `http://${host}`) throw new ViewerError(403, '다른 웹사이트에서 보낸 요청은 허용하지 않습니다.');
  if (request.headers['sec-fetch-site'] === 'cross-site') throw new ViewerError(403, '다른 웹사이트에서 보낸 요청은 허용하지 않습니다.');
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new ViewerError(415, 'JSON 요청이 필요합니다.');
  if (Number(request.headers['content-length'] ?? 0) > 16_384) throw new ViewerError(413, '요청이 너무 큽니다.');
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16_384) throw new ViewerError(413, '요청이 너무 큽니다.');
    chunks.push(chunk as Buffer);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new ViewerError(400, '올바른 JSON 요청이 필요합니다.'); }
}

export function createHandler(service = new ViewerService(), fallback?: Fallback) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    try {
      checkRequest(request);
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      if (!url.pathname.startsWith('/api/')) {
        if (fallback) await fallback(request, response);
        else json(response, 404, { error: '페이지를 찾을 수 없습니다.' });
        return;
      }
      if (request.headers['x-viewer-request'] !== '1') throw new ViewerError(403, '앱에서 보낸 요청만 허용합니다.');
      const allowedMethod = url.pathname === '/api/sources' ? 'POST' : 'GET';
      if (request.method !== allowedMethod) {
        response.setHeader('Allow', allowedMethod);
        throw new ViewerError(405, '허용하지 않는 요청 방식입니다.');
      }
      const params = url.searchParams;
      const source = params.get('source') ?? '';
      const relative = params.get('path') ?? '';
      let result: unknown;
      switch (url.pathname) {
        case '/api/config': result = service.config; break;
        case '/api/sources': result = await service.register((await readBody(request)).path); break;
        case '/api/tree': result = await service.tree(source, relative); break;
        case '/api/file': result = await service.file(source, relative, params); break;
        case '/api/revision': result = await service.revision(source, relative); break;
        case '/api/raw': result = await service.raw(source, relative, Number(params.get('line')), params.get('revision') ?? ''); break;
        default: throw new ViewerError(404, '요청한 기능을 찾을 수 없습니다.');
      }
      json(response, 200, result);
    } catch (error) {
      const failure = publicError(error);
      if (!response.headersSent) json(response, failure.status, { error: failure.message });
      else response.end();
    }
  };
}

const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
export function staticFiles(clientRoot: string): Fallback {
  return async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') throw new ViewerError(405, '허용하지 않는 요청 방식입니다.');
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname); }
    catch { throw new ViewerError(400, '올바른 경로가 아닙니다.'); }
    const candidate = path.resolve(clientRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!isWithin(clientRoot, candidate)) throw new ViewerError(403, '허용하지 않는 경로입니다.');
    const info = await stat(candidate);
    if (!info.isFile()) throw new ViewerError(404, '파일을 찾을 수 없습니다.');
    response.writeHead(200, { 'Content-Type': mime[path.extname(candidate)] ?? 'application/octet-stream', 'Content-Length': info.size });
    if (request.method === 'HEAD') response.end();
    else createReadStream(candidate).on('error', () => response.destroy()).pipe(response);
  };
}

async function start(): Promise<void> {
  const dev = process.argv.includes('--dev');
  const port = Number(process.env.PORT || 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const projectRoot = dev ? path.resolve(fileURLToPath(new URL('..', import.meta.url))) : path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const service = new ViewerService(path.join(projectRoot, 'samples'));
  let handler = createHandler(service, staticFiles(path.join(projectRoot, 'dist/client')));
  const server = createServer((request, response) => { void handler(request, response); });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  if (dev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ root: projectRoot, server: { middlewareMode: true, ws: { server } }, appType: 'spa' });
    handler = createHandler(service, (request, response) => vite.middlewares(request, response));
  }
  server.on('error', () => { console.error('로컬 서버를 시작할 수 없습니다. 포트가 사용 중인지 확인해 주세요.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => { console.log(`JSONL viewer: http://127.0.0.1:${port}`); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void start().catch(() => { console.error('앱을 시작하지 못했습니다. 빌드 상태와 설정을 확인해 주세요.'); process.exitCode = 1; });
}
