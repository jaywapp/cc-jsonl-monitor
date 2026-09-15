import { defaultPreferences } from './viewer-preferences';
import ExtensionSources from './ExtensionSources';
import ThemeSelect from './ThemeSelect';
import { isExtension } from './browser/client';
import { useEffect, useState } from 'react';
import { ArrowRight, FileJson2, FolderOpen, HardDrive, PanelLeftClose, PanelLeftOpen, ShieldCheck, X, AlertCircle } from 'lucide-react';
import type { Source, TreeEntry, ViewerConfig } from '../shared/types';
import { api, messageOf } from './api';
import TreePane from './TreePane';
import FileViewer from './FileViewer';
import FolderView from './FolderView';

export default function App() {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [config, setConfig] = useState<ViewerConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [configReload, setConfigReload] = useState(0);
  const [inputPath, setInputPath] = useState('');
  const [sourceVersion, setSourceVersion] = useState(0);
  const [source, setSource] = useState<Source | null>(null);
  const [selection, setSelection] = useState<TreeEntry | null>(null);
  const [reveal, setReveal] = useState<TreeEntry | null>(null);
  const [opening, setOpening] = useState(false);
  const [pathError, setPathError] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(true);

  useEffect(() => {
    if (isExtension) return;
    const controller = new AbortController(); setConfigError('');
    api<ViewerConfig>('/api/config', { signal: controller.signal }).then((result) => { setConfig(result); setInputPath((old) => old || result.defaultPath); }).catch((error) => { if (!controller.signal.aborted) setConfigError(messageOf(error)); });
    return () => controller.abort();
  }, [configReload]);

  async function openPath(path: string) {
    if (opening) return;
    if (!path.trim()) { setPathError('폴더 또는 JSONL 파일의 절대 경로를 입력해 주세요.'); return; }
    setOpening(true); setPathError('');
    try {
      const result = await api<Source>('/api/sources', { method: 'POST', body: JSON.stringify({ path }) });
      setSource(result); setSourceVersion(value => value + 1); setInputPath(result.path); setReveal(null); setSidebarVisible(true);
      setSelection({ name: result.name, path: result.initialPath, kind: result.kind === 'file' ? 'file' : 'directory' });
    } catch (error) { setPathError(messageOf(error)); }
    finally { setOpening(false); }
  }

  function connectSource(next: Source | null) {
    setSource(next); setSourceVersion(value => value + 1); setReveal(null); setSidebarVisible(true);
    setSelection(next ? { name: next.name, path: '', kind: next.kind } : null);
  }

  function selectInContent(entry: TreeEntry) { setSelection(entry); setReveal({ ...entry }); }

  return <div className="app-shell">
    <a href="#selected-content" className="skip-link">선택한 내용으로 건너뛰기</a>
    <header className="app-header"><div className="app-brand"><span className="brand-symbol"><FileJson2 size={21} strokeWidth={1.6} /></span><strong>cc<span>/</span>jsonl-monitor</strong><span className="app-section">기록 탐색</span></div><div className="header-actions"><div className="local-status"><HardDrive size={14} />{isExtension ? '브라우저에서만 처리' : '내 컴퓨터에서 실행'}</div><ThemeSelect /></div></header>
    {isExtension ? <ExtensionSources source={source} onSource={connectSource} onSelect={selectInContent} /> : <form className="source-bar" onSubmit={(event) => { event.preventDefault(); void openPath(inputPath); }}>
      <label htmlFor="source-path">기준 경로</label><div className="source-input"><FolderOpen size={18} /><input id="source-path" type="text" value={inputPath} onChange={(event) => setInputPath(event.target.value)} placeholder="폴더 또는 .jsonl 파일의 절대 경로" spellCheck={false} autoComplete="off" aria-describedby={pathError ? 'path-error' : 'path-description'} disabled={opening} /><button type="submit" className="primary-button" disabled={opening || !config}>{opening ? '여는 중…' : '경로 열기'}<ArrowRight size={16} /></button></div>
      <button type="button" className="secondary-button default-source" disabled={opening || !config} onClick={() => { if (config) { setInputPath(config.defaultPath); void openPath(config.defaultPath); } }}>기본 로그 폴더</button>
      <p id="path-description" className="source-help">폴더를 기준으로 탐색하거나, JSONL 파일 하나를 직접 열 수 있습니다.</p>
      {pathError && <div className="path-error" id="path-error" role="alert"><AlertCircle size={15} /><span>{pathError}</span><button type="button" className="icon-button" aria-label="경로 오류 안내 닫기" onClick={() => setPathError('')}><X size={14} /></button></div>}
    </form>}
    <div className={`workspace-layout ${sidebarVisible ? '' : 'sidebar-collapsed'}`}>
      {sidebarVisible && <TreePane key={sourceVersion} source={source} selection={selection} onSelect={setSelection} reveal={reveal} />}
      <main className="main-pane" id="selected-content" tabIndex={-1}>
        <div className="content-topline"><button type="button" className="icon-button" title={sidebarVisible ? '파일 탐색기 접기' : '파일 탐색기 펼치기'} aria-label={sidebarVisible ? '파일 탐색기 접기' : '파일 탐색기 펼치기'} onClick={() => setSidebarVisible(!sidebarVisible)}>{sidebarVisible ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button><span>{source ? source.kind === 'file' ? '단일 파일' : '파일 탐색' : '시작하기'}</span>{selection && <><span className="breadcrumb-divider">/</span><span className="topline-selection">{selection.name}</span></>}<span className="read-only"><ShieldCheck size={13} />원본 읽기 전용</span></div>
        {configError ? <div className="content-error" role="alert"><AlertCircle size={32} /><h1>로컬 서버에 연결하지 못했습니다</h1><p>{configError}</p><button type="button" className="secondary-button" onClick={() => setConfigReload((value) => value + 1)}>연결 다시 시도</button></div> : source && selection ? selection.kind === 'file' ? <FileViewer key={`${sourceVersion}:${source.id}:${selection.path}`} source={source} path={selection.path} name={selection.name} preferences={preferences} setPreferences={setPreferences} /> : <FolderView key={`${sourceVersion}:${source.id}:${selection.path}`} source={source} entry={selection} onSelect={selectInContent} /> : <section className="welcome" aria-labelledby="welcome-title"><div className="welcome-icon"><FolderOpen size={43} strokeWidth={1.1} /></div><h1 id="welcome-title">기록이 있는 곳부터 시작하세요.</h1><p>왼쪽에서 파일을 고르고,<br />오른쪽에서 요청부터 결과까지 읽습니다.</p>{!isExtension && <div className="welcome-actions"><button type="button" className="primary-button" disabled={!config || opening} onClick={() => config && void openPath(config.defaultPath)}>Claude Code 기록 열기<ArrowRight size={16} /></button><button type="button" className="secondary-button" disabled={!config || opening} onClick={() => config && void openPath(config.samplePath)}>샘플로 살펴보기</button></div>}<div className="welcome-detail"><div><FolderOpen size={18} /><span><strong>기준 경로의 파일 트리</strong>실제 폴더 구조를 유지합니다.</span></div><div><FileJson2 size={18} /><span><strong>파일별 시간순 기록</strong>요청·도구·응답을 구분합니다.</span></div></div><p className="privacy-note">선택한 기록은 이 컴퓨터에서만 읽습니다.<br />{isExtension ? '위의 폴더 연결 또는 파일 열기로 시작하세요. 원본은 수정하지 않습니다.' : '샘플은 사용법을 확인하기 위한 가상 기록 파일입니다.'}</p></section>}
      </main>
    </div>
  </div>;
}
