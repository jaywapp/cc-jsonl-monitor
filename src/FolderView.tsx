import { useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, FileJson2, Folder, FolderOpen, RefreshCw } from 'lucide-react';
import type { Source, TreeEntry, TreeResult } from '../shared/types';
import { api, endpoint, messageOf } from './api';
import { formatBytes, formatTime } from './format';

interface Props { source: Source; entry: TreeEntry; onSelect: (entry: TreeEntry) => void; }

export default function FolderView({ source, entry, onSelect }: Props) {
  const [data, setData] = useState<TreeResult | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api<TreeResult>(endpoint('tree', { source: source.id, path: entry.path }), { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((reason) => { if (!controller.signal.aborted) setError(messageOf(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [source.id, entry.path, reload]);
  const pathParts = entry.path.split(/[\\/]/).filter(Boolean);
  return <section className="folder-view" aria-labelledby="folder-title">
    <header className="content-heading"><nav className="breadcrumbs" aria-label="현재 폴더 경로"><button type="button" onClick={() => onSelect({ name: source.name, path: '', kind: 'directory' })}>{source.name}</button>{pathParts.map((part, index) => <span key={index}><ChevronRight size={13} /><button type="button" onClick={() => onSelect({ name: part, path: pathParts.slice(0, index + 1).join('/'), kind: 'directory' })}>{part}</button></span>)}</nav>
      <div className="file-title-row"><div className="folder-title-icon"><FolderOpen size={27} strokeWidth={1.5} /></div><div className="title-text"><h1 id="folder-title">{entry.name}</h1><p>{loading ? '폴더 읽는 중…' : `${data?.entries.filter((item) => item.kind === 'directory').length || 0}개 폴더 · ${data?.entries.filter((item) => item.kind === 'file').length || 0}개 JSONL 파일`}</p></div><button className="secondary-button compact" type="button" onClick={() => setReload((value) => value + 1)} disabled={loading}><RefreshCw size={15} />새로고침</button></div>
    </header>
    <div className="folder-content" aria-busy={loading}>{error ? <div className="content-error" role="alert"><AlertCircle size={30} /><h2>폴더를 읽지 못했습니다</h2><p>{error}</p><button className="secondary-button" type="button" onClick={() => setReload((value) => value + 1)}>다시 시도</button></div> : data ? <>
      {data.warning && <p className="notice warning">{data.warning}</p>}
      {data.entries.length > 0 ? <table className="folder-table"><thead><tr><th scope="col">이름</th><th scope="col">수정 시각</th><th scope="col">크기</th></tr></thead><tbody>{data.entries.map((item) => <tr key={item.path}><td><button type="button" onClick={() => onSelect(item)} title={item.name}>{item.kind === 'directory' ? <Folder size={19} className="folder-icon" /> : <FileJson2 size={19} className="file-icon" />}<span>{item.name}</span>{item.kind === 'directory' && <ChevronRight size={14} />}</button></td><td>{formatTime(item.modifiedAt)}</td><td>{item.kind === 'file' && item.size !== undefined ? formatBytes(item.size) : '폴더'}</td></tr>)}</tbody></table> : <div className="content-empty"><FolderOpen size={36} strokeWidth={1.3} /><h2>폴더와 JSONL 파일이 없습니다</h2><p>다른 기준 경로를 입력하거나 왼쪽에서 다른 폴더를 선택하세요.</p></div>}
      <p className="folder-note">폴더와 .jsonl 파일만 표시합니다. 파일을 선택하면 시간순 기록이 열립니다.</p>
    </> : <div className="loading-state" role="status"><div className="skeleton-line" /><div className="skeleton-line short" /><p>파일 목록을 불러오는 중…</p></div>}</div>
  </section>;
}
