# 기록 해석과 표시 규칙

0.3.0부터 JSON 객체를 직렬화해 화면에 출력하지 않습니다. 제목·설명·이름과 값의 목록으로 표시하고, 화면의 원문 펼치기를 제거합니다. 원본 파일은 계속 읽기 전용이며 내부 원문 조회 API는 호환성을 위해 유지합니다.

## 분류하는 패턴

| 입력 형식 | 화면 표시 |
| --- | --- |
| user / assistant, text / thinking | 사용자 요청, Claude 응답, 생각 기록 |
| tool_use / tool_result | 도구 호출·결과, 입력과 구조화된 결과를 상세 항목으로 표시 |
| progress, tool_progress, task_progress | 진행 상황. 명령·에이전트·MCP 등 알려진 세부 형식은 제목에 반영 |
| queue-operation | 요청 대기열, 추가·꺼내기·제거 동작 |
| summary, tool_use_summary | 대화 요약, 도구 작업 요약 |
| system + compact_boundary | 대화 압축, 실행 계기와 토큰 정보 |
| file-history-snapshot / file_history_snapshot / files_persisted | 파일 이력. 백업 정보이며 실제 파일 변경 내역으로 단정하지 않음 |
| custom-title, last-prompt, tag, agent-name, agent-color, session-state, session_state_changed, pr-link, auth_status | 세션 정보·인증 상태 |
| system + init / turn_duration / api_error / local_command / local_command_output / stop_hook_summary / status / bridge_status | 세션 시작, 응답 시간, 오류, 명령 결과, 상태 안내 |
| system + task_started / task_progress / task_notification / task_updated / hook_started / hook_progress / hook_response | 작업·훅 진행과 결과 |
| result, rate_limit_event | 실행 결과·오류, 사용 한도 안내 |
| attachment, image, document | 첨부 정보. 외부 주소와 이미지는 자동으로 불러오지 않음 |
| redacted_thinking | 비공개 생각 기록임을 안내하고 인코딩된 내용은 생략 |
| stream_event | 응답 수신 중 정보. 완성된 응답으로 합치거나 중복 제거하지 않음 |
| 나머지 형식 | 기타 기록. 확인 가능한 값과 형식명을 표시하고 분류 미확정을 안내 |

공식 [Agent SDK 타입 문서](https://code.claude.com/docs/en/agent-sdk/typescript)의 메시지 구분을 참고했습니다. SDK 출력과 Claude Code의 내부 저장 JSONL은 동일한 계약이 아니므로, 알려진 타입명과 실제 존재하는 필드를 기준으로 해석합니다. 모든 내부 버전의 호환성을 보장하지 않습니다. 검증 자료는 저장소의 가상 샘플이며 실제 사용자 기록을 복제하지 않습니다.

## 추출과 표시

- 요약·본문·설명을 먼저 보여주고, 중첩된 메시지·상태·경로·출력·배열 항목을 이름과 값으로 풉니다. 필드의 의미를 모르면 원래 이름을 읽기 좋게 분리해 보존합니다.
- 상태값은 알려진 경우에만 한글로 바꿉니다. 세션 ID·작업 경로·시각이 없으면 만들어 내지 않습니다.
- 상세 항목은 기본 4개를 표시하며 나머지는 펼칩니다. 검색은 접힌 항목까지 포함합니다. 상세 제목은 소속된 기록 분류로 필터링합니다.
- 비밀번호·키·인증 정보로 식별한 필드는 가림 설정을 따릅니다. 기존 텍스트 패턴 가림도 적용합니다. 모든 비밀 값을 탐지하는 것은 아닙니다.
- Base64 첨부와 서명은 표시하지 않습니다. HTML은 실행하지 않고 일반 글자로 표시합니다.
- 이벤트당 제목·본문·상세 항목 합계 8,000자, 상세 항목 24개, 값당 2,000자, 중첩 5단계, 순회 256개 노드로 제한합니다. 한도를 넘으면 생략 안내를 표시합니다. 검색은 추출된 부분만 대상으로 합니다.

## 확인한 결과

공통 테스트 21개, 서버 화면 테스트 7개, 실제 확장 화면 테스트 6개를 통과했습니다. 새 패턴 분류, 중첩 정보 검색, 도구 연결, 필터 조합, 민감 값 가리기, 악성 HTML의 비실행, 깊이·길이 제한, 원본 불변, 다크·라이트 모드, 320/390px와 200% 확대를 포함합니다. 확장 테스트의 운영체제 선택창은 합성 폴더로 대체합니다.

가상 샘플 `samples/atlas/record-patterns.jsonl`에서 추가된 기록 표현을 직접 확인할 수 있습니다.
