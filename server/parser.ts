import { createReadStream } from 'node:fs';
import { ViewerError } from './errors.js';
import { LIMITS, parseLines } from '../shared/parser.js';
export { LIMITS, EVENT_KINDS, type ParsedFile } from '../shared/parser.js';

export async function* readLines(filePath: string): AsyncGenerator<{ line: number; raw: string; terminated: boolean }> {
  let pending = Buffer.alloc(0);
  let line = 1;
  let bytes = 0;
  for await (const chunk of createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
    const buffer = chunk as Buffer;
    bytes += buffer.length;
    if (bytes > LIMITS.fileBytes) throw new ViewerError(413, '파일이 128 MiB 제한을 초과합니다. 파일을 나누어 열어 주세요.');
    const data = pending.length ? Buffer.concat([pending, buffer]) : buffer;
    let start = 0;
    let end: number;
    while ((end = data.indexOf(10, start)) !== -1) {
      if (end - start > LIMITS.lineBytes) throw new ViewerError(413, `${line}행이 512 KiB 제한을 초과합니다.`);
      let raw = data.subarray(start, end).toString('utf8').replace(/\r$/, '');
      if (line === 1) raw = raw.replace(/^\uFEFF/, '');
      yield { line: line++, raw, terminated: true };
      start = end + 1;
    }
    pending = Buffer.from(data.subarray(start));
    if (pending.length > LIMITS.lineBytes) throw new ViewerError(413, `${line}행이 512 KiB 제한을 초과합니다.`);
  }
  if (pending.length) {
    let raw = pending.toString('utf8').replace(/\r$/, '');
    if (line === 1) raw = raw.replace(/^\uFEFF/, '');
    yield { line, raw, terminated: false };
  }
}

export const parseFile = (filePath: string, sourceId: string) => parseLines(readLines(filePath), sourceId);
