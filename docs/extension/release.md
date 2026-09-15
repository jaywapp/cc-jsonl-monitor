# 확장 배포 및 검증

## 산출물

- `npm run build:extension`: `dist/extension`에 Manifest V3 확장 생성
- `npm run package:extension`: Windows PowerShell로 `dist/release/cc-jsonl-monitor-extension.zip` 생성
- ZIP 루트에 `manifest.json`, `background.js`, `index.html`, `icons/`, `assets/`가 들어갑니다.
- 소스, 테스트, 실제 로그, 샘플, 서버 및 Node.js 의존성은 패키지에 포함하지 않습니다.

빌드된 확장을 Chrome의 개발자 모드에서 `dist/extension` 폴더로 로드할 수 있습니다. 재빌드 후 확장 관리 화면에서 새로고침하고 뷰어 탭도 새로고침합니다. 폴더를 옮기거나 다른 확장 ID로 설치하면 최근 연결과 설정은 이전 설치에서 자동 이전되지 않습니다.

## 구현과 자동 검증

확장 전용 탭에서 사용자 선택창을 실행하고, 파일 시스템 핸들을 전용 Worker로 전달해 읽기·파싱·검색합니다. 백그라운드 서비스 워커는 확장 아이콘에서 탭을 여는 역할만 담당합니다. 로컬 서버 버전과 같은 파서·조회 로직을 사용합니다.

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run build:extension
npm run test:extension
```

확장 테스트는 실제 Chromium 확장과 실제 브라우저 파일 핸들, IndexedDB, Worker를 사용합니다. 선택창에서 사용자가 고르는 단계는 합성 OPFS 폴더로 대체합니다. 실제 사용자 로그는 테스트하지 않습니다. 브라우저 테스트 결과는 서로 다른 출력 폴더에 저장합니다.

## 수동 확인 항목

데스크톱 제어 도구 연결 오류로 아직 확인하지 못한 항목입니다.

- 설치한 Chrome에서 **폴더 연결**로 `samples` 폴더를 선택하고 접근을 허용한 뒤 트리를 탐색합니다.
- **파일 열기**로 `samples/atlas/session-auth.jsonl`을 선택합니다. 선택창 취소 후 기존 화면이 유지되는지도 확인합니다.
- 탭·브라우저를 닫았다 다시 열어 최근 연결과 테마가 남는지 확인합니다. 권한이 남아 있으면 복원되고, 아니면 최근 연결을 눌러 재요청할 수 있어야 합니다.
- Chrome에서 읽기 권한을 해제한 후 다시 연결하고, 이동·삭제한 폴더의 오류에서 복구할 수 있는지 확인합니다.
- Windows와 macOS 등 배포 대상 운영체제의 선택창에서 `.claude/projects` 위치로 이동할 수 있는지 확인합니다.

## Chrome 웹 스토어 등록

현재 웹 스토어 미게시 상태입니다. 실행 ZIP, 스토어 규격 스크린샷 3장, 홍보 이미지, 등록 문구와 심사자 테스트 안내를 준비했습니다. 입력할 내용과 남은 정보는 [스토어 등록 정보](store-listing.md)를 참고합니다. 개발자 계정, 공개 개인정보 처리 안내 URL, 문의 연락처를 확인한 뒤 업로드와 심사 제출을 진행합니다. 공개 연락처나 게시 주소는 임의로 정하지 않습니다.

등록 설명에 사용할 실제 기능 요약:

> Claude Code JSONL 로그를 폴더 트리와 시간순으로 조회합니다. 폴더 연결·단일 파일 열기, 세션·기간·기록 제목별 필터, 원문 확인, 파일 변경 알림과 다크모드를 제공합니다. 선택한 로그는 브라우저에서만 처리하며 외부로 전송하지 않습니다.

읽기 전용 파일 접근은 File System Access API로 사용자 선택 후 허용됩니다. 임의 절대 경로 접근을 위한 별도 네이티브 프로그램은 포함하지 않습니다. 파일 감시는 뷰어 탭이 열린 동안에만 수행됩니다.

## 스토어 이미지 재생성

확장 빌드 후 `node scripts/capture-store.mjs`를 실행하면 `docs/extension/store`의 이미지와 규격 정보를 갱신합니다. Playwright Chromium이 필요하며, 별도 실행 파일을 사용하는 경우 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`를 지정합니다.

촬영은 새 브라우저 프로필에서 저장소의 가상 샘플만 사용합니다. 선택창을 합성 폴더로 대체하므로 이 작업이 실제 운영체제 선택창 검증을 대신하지는 않습니다.

`dist/release/cc-jsonl-monitor-webstore-kit.zip`은 실행 ZIP과 등록 자료를 모은 전달용 묶음입니다. 웹 스토어의 확장 업로드에는 그 안의 `cc-jsonl-monitor-extension.zip`만 사용하고, 스크린샷과 홍보 이미지는 각 등록 필드에 따로 첨부합니다.