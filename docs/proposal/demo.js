"use strict";

// All records are synthetic examples, never local transcripts.
const workspaces = [
  { id: "atlas", name: "atlas", path: "D:\\work\\atlas", folder: "D--work-atlas" },
  { id: "ledger", name: "ledger", path: "D:\\work\\ledger", folder: "D--work-ledger" },
  { id: "atlas-lab", name: "atlas", path: "D:\\experiments\\atlas", folder: "D--experiments-atlas" }
];
const sessions = [
  {
    id: "session-auth", workspace: "atlas", title: "로그인 만료 처리 개선",
    preview: "만료된 세션에서 로그인 화면으로 돌아가도록 해줘.",
    events: [
      { time: "10:24:08", kind: "user", title: "만료된 세션에서 로그인 화면으로 돌아가도록 해줘.", text: "로그인 만료 후 빈 화면이 나오는 문제를 확인하고 테스트도 추가해줘." },
      { time: "10:24:15", kind: "assistant", title: "인증 처리와 기존 테스트를 확인하겠습니다.", text: "라우트 진입 시 세션 검사와 오류 처리 경로부터 확인합니다." },
      { time: "10:24:22", kind: "tool", tool: "Read", callId: "call-read-auth", title: "인증 라우트 확인", text: "src/auth/guard.ts", input: { file_path: "D:\\work\\atlas\\src\\auth\\guard.ts" } },
      { time: "10:24:23", kind: "result", tool: "Read", callId: "call-read-auth", title: "만료 분기에서 이동 처리가 빠져 있습니다.", text: "if (!session.valid) return null;\n읽기 결과의 가상 발췌입니다." },
      { time: "10:27:40", kind: "tool", tool: "Bash", callId: "call-test-1", title: "인증 테스트 실행", text: "npm test -- auth", input: { command: "npm test -- auth" } },
      { time: "10:27:43", kind: "error", tool: "Bash", callId: "call-test-1", title: "실패 · 만료된 세션의 이동 경로 불일치", text: "Expected: /login\nReceived: /dashboard\n1 failed, 7 passed" },
      { time: "10:29:10", kind: "user", title: "로그인 후 원래 화면으로 돌아갈 수 있게 해줘.", text: "이동할 때 returnTo도 보존해줘." },
      { time: "10:31:02", kind: "tool", tool: "Edit", callId: "call-edit", title: "만료 처리와 복귀 경로 수정", text: "src/auth/guard.ts", input: { file_path: "D:\\work\\atlas\\src\\auth\\guard.ts", old_string: "return null;", new_string: "return redirectToLogin(currentPath);" } },
      { time: "10:31:03", kind: "result", tool: "Edit", callId: "call-edit", title: "수정 도구가 성공을 반환했습니다.", text: "최종 디스크 상태나 커밋 여부를 의미하지 않습니다." },
      { time: "10:33:26", kind: "tool", tool: "Bash", callId: "call-test-2", title: "인증 테스트 다시 실행", text: "npm test -- auth", input: { command: "npm test -- auth" } },
      { time: "10:33:29", kind: "result", tool: "Bash", callId: "call-test-2", title: "성공 · 인증 테스트 8개 통과", text: "8 passed\n이 명령의 결과이며 세션 전체 완료 상태는 아닙니다." },
      { time: "10:34:10", kind: "assistant", title: "만료 시 로그인 이동과 복귀 경로를 반영했습니다.", text: "인증 테스트를 통과했습니다. 실제 브라우저에서의 로그인 흐름은 별도 확인이 필요합니다." }
    ]
  },
  { id: "session-nav", workspace: "atlas", title: "모바일 메뉴 구조 살펴보기", preview: "작은 화면에서 메뉴가 잘리는 원인을 찾아줘.", events: [
    { time: "09:02:11", kind: "user", title: "작은 화면에서 메뉴가 잘리는 원인을 찾아줘.", text: "수정하기 전에 원인과 대안을 먼저 설명해줘." },
    { time: "09:03:05", kind: "tool", tool: "Read", callId: "call-nav-read", title: "메뉴 스타일 읽기", text: "src/navigation.css", input: { file_path: "D:\\work\\atlas\\src\\navigation.css" } },
    { time: "09:03:06", kind: "result", tool: "Read", callId: "call-nav-read", title: "최소 너비가 작은 화면보다 크게 지정되어 있습니다.", text: ".navigation { min-width: 720px; }" },
    { time: "09:05:31", kind: "assistant", title: "모바일에서는 메뉴를 세로로 배치하는 안을 제안합니다.", text: "고정된 최소 너비를 제거하고 화면 폭에 따라 메뉴 배치를 변경합니다. 아직 파일은 수정하지 않았습니다." }
  ] },
  { id: "session-export", workspace: "ledger", title: "거래 내역 CSV 형식 정리", preview: "내보내는 CSV에서 날짜 표기를 통일해줘.", events: [
    { time: "11:08:02", kind: "user", title: "내보내는 CSV에서 날짜 표기를 통일해줘.", text: "날짜는 YYYY-MM-DD 형식으로 표시해줘." },
    { time: "11:09:18", kind: "tool", tool: "Read", callId: "call-csv-read", title: "내보내기 코드 읽기", text: "src/export/csv.ts", input: { file_path: "D:\\work\\ledger\\src\\export\\csv.ts" } },
    { time: "11:09:19", kind: "result", tool: "Read", callId: "call-csv-read", title: "지역 설정에 따라 날짜 출력이 달라집니다.", text: "row.date.toLocaleDateString()" },
    { time: "11:12:44", kind: "assistant", title: "시간대 경계를 포함한 변환 규칙이 필요합니다.", text: "UTC로 저장된 거래 시간을 표시 시간대로 바꾼 뒤 날짜를 추출하는 안을 제안합니다." }
  ] },
  { id: "session-query", workspace: "ledger", title: "거래 검색 조건 검토", preview: "금액과 메모를 함께 검색하는 구조를 살펴봐줘.", events: [
    { time: "08:15:10", kind: "user", title: "금액과 메모를 함께 검색하는 구조를 살펴봐줘.", text: "필터와 자유 검색의 역할을 나눠 설명해줘." },
    { time: "08:16:35", kind: "assistant", title: "금액은 범위 필터, 메모는 텍스트 검색으로 나눕니다.", text: "같은 결과 목록에 두 조건을 함께 적용하면 원하는 거래를 더 빠르게 좁힐 수 있습니다." }
  ] },
  { id: "session-parser", workspace: "atlas-lab", title: "JSONL 파서 실험", preview: "마지막 줄이 덜 쓰인 파일도 읽을 수 있게 해줘.", events: [
    { time: "13:05:12", kind: "user", title: "마지막 줄이 덜 쓰인 파일도 읽을 수 있게 해줘.", text: "완료된 줄은 먼저 보여주고 나머지는 다음 읽기까지 기다리면 좋겠어." },
    { time: "13:06:20", kind: "tool", tool: "Bash", callId: "call-parser-test", title: "부분 기록 fixture 검증", text: "npm test -- parser", input: { command: "npm test -- parser" } },
    { time: "13:06:22", kind: "error", tool: "Bash", callId: "call-parser-test", title: "실패 · 마지막 줄을 완결된 JSON으로 처리했습니다.", text: "SyntaxError: Unexpected end of JSON input\nfixture: partial-tail.jsonl" },
    { time: "13:08:09", kind: "assistant", title: "마지막 byte 조각을 버퍼에 보관하도록 제안합니다.", text: "다음 읽기에서 이어 붙이고 완결된 줄만 파싱합니다. 이 예시에는 이후 실행 결과가 없습니다." }
  ] }
];
const kindLabels = { user: "사용자", assistant: "Claude", tool: "도구 호출", result: "도구 결과", error: "도구 결과" };
const state = { workspace: "atlas", session: "session-auth", filter: "all", query: "", order: "asc" };
const byId = (id) => document.getElementById(id);
const currentSession = () => sessions.find((item) => item.id === state.session);
const getWorkspace = (id) => workspaces.find((item) => item.id === id);
const sessionPath = (session) => `C:\\Users\\demo\\.claude\\projects\\${getWorkspace(session.workspace).folder}\\${session.id}.jsonl`;
const normalizePath = (path) => path.trim().replace(/^"(.*)"$/, "$1").replaceAll("/", "\\").toLowerCase();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function getRawRecord(session, event, index) {
  let content;
  if (event.kind === "tool") content = [{ type: "tool_use", id: event.callId, name: event.tool, input: event.input }];
  else if (event.kind === "result" || event.kind === "error") content = [{ type: "tool_result", tool_use_id: event.callId, content: event.text, is_error: event.kind === "error" }];
  else content = [{ type: "text", text: `${event.title}\n${event.text}` }];
  return { type: ["user", "result", "error"].includes(event.kind) ? "user" : "assistant", sessionId: session.id, uuid: `${session.id}-event-${index + 1}`, timestamp: `2026-09-14T${event.time}+09:00`, cwd: getWorkspace(session.workspace).path, message: { content } };
}
function clearFilters() {
  state.filter = "all"; state.query = ""; byId("event-search").value = "";
}
function selectSession(sessionId) {
  const session = sessions.find((item) => item.id === sessionId);
  state.session = session.id; state.workspace = session.workspace;
  clearFilters();
  byId("path-status").textContent = "";
  byId("path-status").classList.remove("is-error");
  byId("file-path").value = sessionPath(session);
  renderWorkspaces(); renderSessions(); renderTimeline();
}
function renderWorkspaces() {
  const list = byId("workspaces"); list.replaceChildren();
  for (const workspace of workspaces) {
    const button = element("button", "workspace-button"); button.type = "button";
    button.setAttribute("aria-pressed", String(state.workspace === workspace.id));
    button.setAttribute("aria-label", `${workspace.name}, ${workspace.path}`);
    button.append(element("strong", "", workspace.name), element("span", "mono", workspace.path), element("span", "workspace-count", `${sessions.filter((item) => item.workspace === workspace.id).length}개 세션`));
    button.addEventListener("click", () => {
      selectSession(sessions.find((item) => item.workspace === workspace.id).id);
      byId("workspaces").querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
    });
    list.append(button);
  }
}
function renderSessions() {
  const list = byId("sessions");
  const matching = sessions.filter((item) => item.workspace === state.workspace).sort((a, b) => b.events.at(-1).time.localeCompare(a.events.at(-1).time));
  byId("session-count").textContent = String(matching.length); list.replaceChildren();
  for (const session of matching) {
    const button = element("button", "session-button"); button.type = "button";
    button.setAttribute("aria-pressed", String(state.session === session.id));
    button.append(element("strong", "", session.title), element("span", "preview", session.preview));
    const time = element("span", "session-time", `${session.events[0].time.slice(0, 5)} ~ ${session.events.at(-1).time.slice(0, 5)} · ${session.events.length}개 이벤트`);
    const errors = session.events.filter((event) => event.kind === "error").length;
    if (errors) time.append(element("span", "error-count", ` · 오류 ${errors}`));
    button.append(time);
    button.addEventListener("click", () => { selectSession(session.id); byId("sessions").querySelector('[aria-pressed="true"]').focus({ preventScroll: true }); });
    list.append(button);
  }
}
function renderTimeline() {
  const session = currentSession();
  byId("workspace-path").textContent = getWorkspace(session.workspace).path;
  byId("session-title").textContent = session.title;
  byId("session-meta").textContent = `${session.id} · 마지막 기록 ${session.events.at(-1).time} · 가상 데이터`;
  document.querySelectorAll("[data-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter)));
  const matches = session.events.map((event, index) => ({ event, index })).filter(({ event }) => {
    const matchesKind = state.filter === "all" || (state.filter === "tool" ? ["tool", "result", "error"].includes(event.kind) : event.kind === state.filter);
    const searchText = [event.title, event.text, event.tool || "", event.callId || "", JSON.stringify(event.input || {})].join(" ").toLowerCase();
    return matchesKind && searchText.includes(state.query.trim().toLowerCase());
  }).sort((a, b) => { const comparison = a.event.time.localeCompare(b.event.time) || a.index - b.index; return state.order === "desc" ? -comparison : comparison; });
  byId("event-count").textContent = `${session.events.length}개 중 ${matches.length}개 표시 · ${state.order === "asc" ? "과거부터" : "최신부터"} · KST`;
  const list = byId("events"); list.replaceChildren();
  if (!matches.length) {
    const empty = element("div", "empty-state"); empty.append(element("p", "", "조건에 맞는 기록이 없습니다."));
    const reset = element("button", "", "검색·필터 초기화"); reset.type = "button";
    reset.addEventListener("click", () => { clearFilters(); renderTimeline(); byId("event-search").focus(); });
    empty.append(reset); list.append(empty); return;
  }
  for (const { event, index } of matches) {
    const article = element("article", `event is-${event.kind}`);
    const header = element("div", "event-header"); header.append(element("strong", "", kindLabels[event.kind]));
    if (event.tool) header.append(element("span", "event-kind", event.tool));
    const time = element("time", "", event.time); time.dateTime = `2026-09-14T${event.time}+09:00`; header.append(time);
    article.append(header, element("h4", "", event.title), element("p", "", event.text));
    const details = element("details");
    details.append(element("summary", "", `원문 예시 · ${index + 1}번째 줄${event.callId ? ` · ${event.callId}` : ""}`));
    details.append(element("p", "event-source", `${sessionPath(session)}:${index + 1}`));
    details.append(element("p", "", "설명용 가상 레코드입니다. 실제 내부 스키마는 버전별 검증이 필요합니다."));
    details.append(element("pre", "", JSON.stringify(getRawRecord(session, event, index), null, 2)));
    article.append(details); list.append(article);
  }
}
byId("event-search").addEventListener("input", (event) => { state.query = event.target.value; renderTimeline(); });
byId("event-order").addEventListener("change", (event) => { state.order = event.target.value; renderTimeline(); });
document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.filter; renderTimeline(); }));
byId("path-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const requested = normalizePath(byId("file-path").value);
  const match = sessions.find((session) => normalizePath(sessionPath(session)) === requested);
  const status = byId("path-status");
  if (match) {
    selectSession(match.id);
    status.textContent = "예시 경로에 해당하는 세션을 열었습니다. 실제 파일은 읽지 않았습니다.";
    status.classList.remove("is-error");
  } else {
    status.textContent = requested ? "이 화면은 가상 경로만 지원합니다. 아래에서 세션을 선택하면 사용할 예시 경로가 채워집니다. 실제 파일 경로 지정은 MVP 필수 기능입니다." : "예시 파일의 절대 경로를 입력해 주세요. 아래 세션을 선택하면 경로가 채워집니다.";
    status.classList.add("is-error");
  }
});
selectSession(state.session);
