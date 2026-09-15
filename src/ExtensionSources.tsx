import { useEffect, useRef, useState } from 'react';
import { FolderOpen, FileJson2, ArrowRight, X, AlertCircle } from 'lucide-react';
import type { Source, TreeEntry } from '../shared/types';
import { pickSource, recentSources, reconnect, restoreSource, forgetSource, resolveEntry, type RecentSource } from './browser/client';
import { fileError } from './browser/filesystem';

interface Props { source: Source | null; onSource(source: Source | null): void; onSelect(entry: TreeEntry): void; }
export default function ExtensionSources({ source, onSource, onSelect }: Props) {
  const [recent, setRecent] = useState<RecentSource[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [path, setPath] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    restoreSource().then(onSource).then(() => recentSources()).then(setRecent).catch(reason => setError(fileError(reason))).finally(() => setBusy(false));
  }, []);
  useEffect(() => setPath(''), [source?.id]);

  async function connect(operation: () => Promise<Source | null>) {
    setBusy(true); setError('');
    try { const next = await operation(); if (next) onSource(next); setRecent(await recentSources()); }
    catch (reason) { setError(fileError(reason)); }
    finally { setBusy(false); }
  }
  async function forget(item: RecentSource) {
    setBusy(true); setError('');
    try { await forgetSource(item.id, source?.id === item.id); if (source?.id === item.id) onSource(null); setRecent(await recentSources()); }
    catch (reason) { setError(fileError(reason)); }
    finally { setBusy(false); }
  }
  async function openRelative() {
    if (!source) return;
    setBusy(true); setError('');
    try { onSelect(await resolveEntry(source.id, path.trim())); }
    catch (reason) { setError(fileError(reason)); }
    finally { setBusy(false); }
  }
  return <section className="extension-sources" aria-label="로그 폴더 연결">
    <div className="connection-row"><span className="connection-label">기록 연결</span><button type="button" className="primary-button" disabled={busy} onClick={() => void connect(() => pickSource('directory'))}><FolderOpen size={16} />폴더 연결</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void connect(() => pickSource('file'))}><FileJson2 size={16} />파일 열기</button><span className="connection-hint">Claude 로그가 있는 .claude/projects 폴더를 선택하세요.</span></div>
    {recent.length > 0 && <div className="recent-connections" aria-label="최근 연결"><span>최근 연결</span>{recent.map(item => <span className={`recent-item ${source?.id === item.id ? 'active' : ''}`} key={item.id}><button type="button" disabled={busy} title={`${item.kind === 'file' ? '파일' : '폴더'} 다시 연결`} onClick={() => void connect(() => reconnect(item))}>{item.kind === 'file' ? <FileJson2 size={13} /> : <FolderOpen size={13} />}<span>{item.name}</span></button><button type="button" disabled={busy} aria-label={`${item.name} 연결 목록에서 제거`} title="목록에서 제거 (원본 파일 유지)" onClick={() => void forget(item)}><X size={13} /></button></span>)}</div>}
    {source?.kind === 'directory' && <form className="relative-path" onSubmit={event => { event.preventDefault(); void openRelative(); }}><label htmlFor="relative-path">폴더 내 경로</label><input id="relative-path" placeholder="예: project/session.jsonl" value={path} onChange={event => setPath(event.target.value)} spellCheck={false} autoComplete="off" /><button type="submit" className="secondary-button compact" disabled={busy}>이동<ArrowRight size={14} /></button></form>}
    {busy && <p className="connection-notice" role="status">연결을 확인하고 있습니다…</p>}
    {!busy && !source && recent.length > 0 && <p className="connection-notice">최근 연결을 누르면 읽기 권한을 확인하고 다시 엽니다.</p>}
    {error && <p className="connection-error" role="alert"><AlertCircle size={15} />{error}</p>}
  </section>;
}
