import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileJson2, Folder, FolderOpen, RefreshCw, AlertCircle } from 'lucide-react';
import type { Source, TreeEntry, TreeResult } from '../shared/types';
import { api, endpoint, messageOf } from './api';

interface Props {
  source: Source | null;
  selection: TreeEntry | null;
  onSelect: (entry: TreeEntry) => void;
  reveal: TreeEntry | null;
}

export default function TreePane({ source, selection, onSelect, reveal }: Props) {
  const [children, setChildren] = useState<Map<string, TreeEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState('');
  const generation = useRef(0);
  const treeRef = useRef<HTMLDivElement>(null);
  const root: TreeEntry | null = source ? { name: source.name, path: '', kind: source.kind === 'file' ? 'file' : 'directory' } : null;

  async function load(path: string, currentGeneration = generation.current) {
    if (!source || source.kind === 'file') return;
    setLoading((old) => new Set(old).add(path));
    try {
      const result = await api<TreeResult>(endpoint('tree', { source: source.id, path }));
      if (currentGeneration !== generation.current) return;
      setChildren((old) => new Map(old).set(path, result.entries));
      setErrors((old) => new Map(old).set(path, result.warning || ''));
    } catch (error) {
      if (currentGeneration === generation.current) setErrors((old) => new Map(old).set(path, messageOf(error)));
    } finally {
      if (currentGeneration === generation.current) setLoading((old) => { const next = new Set(old); next.delete(path); return next; });
    }
  }

  useEffect(() => {
    generation.current += 1;
    setChildren(new Map()); setExpanded(new Set([''])); setErrors(new Map()); setLoading(new Set()); setFocused('');
    if (source?.kind === 'directory') void load('');
    return () => { generation.current += 1; };
  }, [source?.id]);

  useEffect(() => {
    if (!reveal || !source) return;
    const parts = reveal.path.split(/[\\/]/).filter(Boolean);
    const ancestors = [''];
    for (let index = 1; index < parts.length; index++) ancestors.push(parts.slice(0, index).join('/'));
    if (reveal.kind === 'directory') ancestors.push(reveal.path);
    setExpanded((old) => new Set([...old, ...ancestors]));
    ancestors.forEach((path) => { if (!children.get(path) && !loading.has(path)) void load(path); });
    setFocused(reveal.path);
  }, [reveal, source?.id]);

  function toggle(entry: TreeEntry) {
    if (entry.kind !== 'directory') return;
    if (!expanded.has(entry.path) && !children.get(entry.path)) void load(entry.path);
    setExpanded((old) => { const next = new Set(old); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next; });
  }

  function moveFocus(path: string) {
    setFocused(path);
    const rows = treeRef.current?.querySelectorAll<HTMLButtonElement>('[role="treeitem"]');
    Array.from(rows || []).find((row) => row.dataset.path === path)?.focus();
  }

  function handleKeys(event: React.KeyboardEvent, entry: TreeEntry, parentPath?: string) {
    const rows = Array.from(treeRef.current?.querySelectorAll<HTMLButtonElement>('[role="treeitem"]') || []);
    const index = rows.findIndex((row) => row.dataset.path === entry.path);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowDown') moveFocus(rows[Math.min(index + 1, rows.length - 1)]?.dataset.path || '');
    if (event.key === 'ArrowUp') moveFocus(rows[Math.max(index - 1, 0)]?.dataset.path || '');
    if (event.key === 'Home') moveFocus('');
    if (event.key === 'End') moveFocus(rows.at(-1)?.dataset.path || '');
    if (event.key === 'ArrowRight' && entry.kind === 'directory') {
      if (!expanded.has(entry.path)) toggle(entry);
      else if (children.get(entry.path)?.length) moveFocus(children.get(entry.path)![0].path);
    }
    if (event.key === 'ArrowLeft') {
      if (entry.kind === 'directory' && expanded.has(entry.path)) toggle(entry);
      else if (parentPath !== undefined) moveFocus(parentPath);
    }
  }

  function renderEntry(entry: TreeEntry, depth: number, parentPath?: string): React.ReactNode {
    const isExpanded = expanded.has(entry.path);
    const Icon = entry.kind === 'file' ? FileJson2 : isExpanded ? FolderOpen : Folder;
    return <div key={entry.path} role="none">
      <button className={`tree-row ${selection?.path === entry.path ? 'selected' : ''}`} type="button"
        role="treeitem" aria-level={depth + 1} aria-selected={selection?.path === entry.path}
        aria-expanded={entry.kind === 'directory' ? isExpanded : undefined}
        data-path={entry.path} tabIndex={focused === entry.path ? 0 : -1}
        title={entry.name} style={{ paddingLeft: `${12 + depth * 18}px` }}
        onFocus={() => setFocused(entry.path)} onKeyDown={(event) => handleKeys(event, entry, parentPath)}
        onClick={() => { setFocused(entry.path); onSelect(entry); toggle(entry); }}>
        <span className="tree-chevron">{entry.kind === 'directory' ? isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}</span>
        <Icon size={17} className={entry.kind === 'file' ? 'file-icon' : 'folder-icon'} />
        <span className="tree-name">{entry.name}</span>
      </button>
      {entry.kind === 'directory' && isExpanded && <div role="group">
        {loading.has(entry.path) && <p className="tree-hint" role="status" style={{ paddingLeft: `${36 + depth * 18}px` }}>폴더 읽는 중…</p>}
        {errors.get(entry.path) && <div className="tree-error"><AlertCircle size={14} /><span>{errors.get(entry.path)}</span><button type="button" onClick={() => void load(entry.path)}>재시도</button></div>}
        {children.get(entry.path)?.map((child) => renderEntry(child, depth + 1, entry.path))}
        {children.get(entry.path)?.length === 0 && !loading.has(entry.path) && !errors.get(entry.path) && <p className="tree-hint" style={{ paddingLeft: `${36 + depth * 18}px` }}>하위 폴더·JSONL 없음</p>}
      </div>}
    </div>;
  }

  return <aside className="sidebar" aria-label="기준 경로 파일 탐색기">
    <header className="pane-heading"><div><Folder size={17} /><h2>파일 탐색기</h2></div>
      <button type="button" className="icon-button" aria-label="파일 트리 새로고침" title="파일 트리 새로고침" disabled={!source || loading.size > 0}
        onClick={() => { for (const path of expanded) void load(path); }}><RefreshCw size={16} /></button>
    </header>
    {source ? <>
      <p className="tree-root-path" title={source.path}>{source.path}</p>
      <div ref={treeRef} className="file-tree" role="tree" aria-label="폴더와 JSONL 파일">{root && renderEntry(root, 0)}</div>
      <footer className="tree-footer"><span className="status-dot" />읽기 전용<span>{source.kind === 'file' ? '단일 파일' : '폴더 기준'}</span></footer>
    </> : <div className="sidebar-empty"><FolderOpen size={30} strokeWidth={1.4} /><strong>기준 경로를 지정하세요</strong><p>폴더 구조를 그대로 보여줍니다.<br />JSONL 파일 하나도 열 수 있습니다.</p></div>}
  </aside>;
}
