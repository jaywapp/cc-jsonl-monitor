export type EventKind = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'thinking' | 'system' | 'progress' | 'summary' | 'file_history' | 'session' | 'unknown';

export interface Source {
  id: string;
  kind: 'directory' | 'file';
  path: string;
  name: string;
  initialPath: string;
}

export interface TreeEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  size?: number;
  modifiedAt?: string;
}

export interface TreeResult {
  path: string;
  entries: TreeEntry[];
  warning?: string;
}

export interface EventDetail { label: string; value: string; sensitive?: boolean; }

export interface TranscriptEvent {
  id: string;
  kind: EventKind;
  line: number;
  blockIndex: number;
  timestamp: string | null;
  sessionId: string | null;
  cwd: string | null;
  text: string;
  title?: string;
  details?: EventDetail[];
  partial?: boolean;
  toolName?: string;
  toolUseId?: string;
  linkedEventId?: string;
  linkState?: 'linked' | 'missing' | 'ambiguous';
  isError: boolean;
  truncated?: boolean;
}

export interface Diagnostic {
  line: number;
  message: string;
}

export interface FileView {
  filePath: string;
  revision: string;
  size: number;
  modifiedAt: string;
  totalEvents: number;
  matchedEvents: number;
  offset: number;
  limit: number;
  events: TranscriptEvent[];
  sessionIds: string[];
  cwdPaths: string[];
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  counts: Record<EventKind, number>;
  diagnostics: Diagnostic[];
  pendingTail: boolean;
  truncated: boolean;
}

export interface RawRecord {
  line: number;
  raw: string;
  truncated: boolean;
}

export interface ViewerConfig {
  defaultPath: string;
  samplePath: string;
  platform: string;
}

// GET /api/config -> ViewerConfig
// POST /api/sources { path } -> Source
// GET /api/tree?source=<id>&path=<relative directory> -> TreeResult
// GET /api/file?source=&path=&q=&kind=&order=asc|desc&session=&from=&to=&offset=0&limit=100 -> FileView
//   kind accepts EventKind, all, tools (both tool kinds), error.
//   from/to use YYYY-MM-DD and timezone=local|utc; backend defaults local.
// GET /api/analysis?source=&path=&revision= -> WorkAnalysis (full file, 409 on changed file)
// GET /api/raw?source=&path=&line=&revision= -> RawRecord (409 on changed file)
// GET /api/revision?source=&path= -> { revision: string, exists: boolean }
// Every request sends X-Viewer-Request: 1. No CORS. Errors: { error: string }.
