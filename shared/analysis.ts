import type { ParsedFile } from './parser.js';
import type { TranscriptEvent } from './types.js';
import { ViewerError } from './errors.js';

export interface WorkPattern {
  kind: 'repeat' | 'retry';
  tool: string;
  sessionId: string;
  count: number;
  evidence: TranscriptEvent[];
}
export interface RequestFlow {
  request: TranscriptEvent;
  calls: number;
  responses: number;
  errors: number;
  lastLine: number;
}
export interface WorkAnalysis {
  revision: string;
  totalEvents: number;
  requests: number;
  toolCalls: number;
  responses: number;
  errors: number;
  sessions: number;
  missingSessions: number;
  missingTimes: number;
  partialEvents: number;
  diagnostics: number;
  pendingTail: boolean;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  tools: { name: string; calls: number; linkedResults: number; errors: number; unlinked: number }[];
  totalTools: number;
  patterns: WorkPattern[];
  totalPatterns: number;
  flows: RequestFlow[];
  totalFlows: number;
}

// These are comparisons of readable projected fields, never claims of semantic equality.
function signature(event: TranscriptEvent): string | null {
  if (!event.toolName || event.partial || event.truncated || !event.details?.length) return null;
  return JSON.stringify([event.toolName, event.text, event.details.map(field => [field.label, field.value]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
}

export function analyzeFile(snapshot: { revision: string; parsed: ParsedFile }, revision: string): WorkAnalysis {
  if (!revision) throw new ViewerError(400, '분석할 파일 버전이 필요합니다.');
  if (snapshot.revision !== revision) throw new ViewerError(409, '파일이 변경되었습니다. 대화를 새로고침한 뒤 다시 분석해 주세요.');
  const { parsed } = snapshot;
  const events = parsed.events;
  const byId = new Map(events.map(event => [event.id, event]));
  const tools = new Map<string, WorkAnalysis['tools'][number]>();
  const groups = new Map<string, WorkPattern>();
  const retries: WorkPattern[] = [];
  const flows: RequestFlow[] = [];
  const current = new Map<string, RequestFlow>();
  const failed = new Map<string, Map<string, [TranscriptEvent, TranscriptEvent]>>();
  const requests = new Set<number>();
  let responses = 0, errors = 0, missingSessions = 0, missingTimes = 0, partialEvents = 0;
  for (const event of events) {
    if (event.kind === 'user') requests.add(event.line);
    if (event.kind === 'assistant') responses++;
    if (event.isError) errors++;
    if (!event.sessionId) missingSessions++;
    if (!event.timestamp) missingTimes++;
    if (event.partial || event.truncated) partialEvents++;
    if (event.kind === 'tool_use') {
      const name = event.toolName || 'unknown';
      const tool = tools.get(name) ?? { name, calls: 0, linkedResults: 0, errors: 0, unlinked: 0 };
      tool.calls++;
      const result = event.linkState === 'linked' && event.linkedEventId ? byId.get(event.linkedEventId) : undefined;
      if (result?.kind === 'tool_result' && result.sessionId === event.sessionId && (result.line > event.line || (result.line === event.line && result.blockIndex > event.blockIndex))) {
        tool.linkedResults++; if (result.isError) tool.errors++;
      } else tool.unlinked++;
      tools.set(name, tool);
    }
    // Sessionless records are counted but not stitched into a guessed conversation.
    if (!event.sessionId) continue;
    const session = event.sessionId;
    if (event.kind === 'user' && current.get(session)?.request.line !== event.line) {
      const flow: RequestFlow = { request: event, calls: 0, responses: 0, errors: 0, lastLine: event.line };
      current.set(session, flow); flows.push(flow); failed.delete(session);
    }
    const flow = current.get(session);
    if (flow) {
      flow.lastLine = event.line;
      if (event.kind === 'tool_use') flow.calls++;
      if (event.kind === 'assistant') flow.responses++;
      if (event.isError) flow.errors++;
    }
    if (event.kind === 'tool_use') {
      const input = signature(event);
      if (!input) continue;
      const key = JSON.stringify([session, flow?.request.line ?? 0, input]);
      const group = groups.get(key) ?? { kind: 'repeat', tool: event.toolName!, sessionId: session, count: 0, evidence: [] };
      group.count++;
      if (group.evidence.length < 3) group.evidence.push(event);
      groups.set(key, group);
      const prior = failed.get(session)?.get(input);
      if (prior) {
        retries.push({ kind: 'retry', tool: event.toolName!, sessionId: session, count: 1, evidence: [...prior, event] });
        failed.get(session)!.delete(input);
      }
    } else if (event.kind === 'tool_result' && event.isError && event.linkState === 'linked' && event.linkedEventId) {
      const call = byId.get(event.linkedEventId);
      if (!call || call.kind !== 'tool_use' || call.sessionId !== session || call.line > event.line || (call.line === event.line && call.blockIndex >= event.blockIndex)) continue;
      // A delayed result from an earlier request must not seed the current request's retry.
      if (flow && call.line < flow.request.line) continue;
      const input = signature(call);
      if (!input) continue;
      const pending = failed.get(session) ?? new Map<string, [TranscriptEvent, TranscriptEvent]>();
      pending.set(input, [call, event]); failed.set(session, pending);
    }
  }
  const patterns = [...retries, ...[...groups.values()].filter(group => group.count >= 3).sort((a, b) => b.count - a.count)];
  const usage = [...tools.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
  return {
    revision, totalEvents: events.length, toolCalls: usage.reduce((sum, tool) => sum + tool.calls, 0), requests: requests.size, responses, errors,
    sessions: parsed.sessionIds.length, missingSessions, missingTimes, partialEvents,
    diagnostics: parsed.diagnostics.length, pendingTail: parsed.pendingTail,
    firstTimestamp: parsed.firstTimestamp, lastTimestamp: parsed.lastTimestamp,
    tools: usage.slice(0, 20), totalTools: usage.length,
    patterns: patterns.slice(0, 20), totalPatterns: patterns.length,
    flows: flows.slice(0, 20), totalFlows: flows.length,
  };
}
