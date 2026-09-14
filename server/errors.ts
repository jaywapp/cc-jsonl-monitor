export class ViewerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function publicError(error: unknown): ViewerError {
  if (error instanceof ViewerError) return error;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return new ViewerError(404, '경로가 없거나 파일이 삭제되었습니다.');
  if (code === 'EACCES' || code === 'EPERM') return new ViewerError(403, '이 경로를 읽을 권한이 없습니다.');
  return new ViewerError(500, '파일을 읽지 못했습니다. 경로와 접근 권한을 확인해 주세요.');
}
