# 설치 방식과 업데이트

확인일: 2026-09-15

## ZIP을 수동으로 설치한 경우

현재 배포 ZIP을 압축 해제하여 Chrome 개발자 모드에서 로드한 확장은 GitHub Releases의 새 파일로 자동 교체되지 않습니다. Actions는 새 ZIP을 게시하는 역할이며, 사용자의 설치 폴더를 갱신하지 않습니다.

업데이트할 때는 최신 ZIP을 같은 설치 폴더에 풀고 `chrome://extensions`에서 해당 확장을 새로고침합니다. 뷰어 탭도 새로고침하면 새 화면을 읽습니다. 필터는 탭 메모리에만 보관하므로 새로고침 시 초기화됩니다.

Chrome의 전체 **업데이트** 버튼이나 `runtime.requestUpdateCheck()`는 GitHub ZIP 다운로드·덮어쓰기를 대신하지 않습니다. `update_url`만 추가해도 압축 해제된 확장이 스토어 설치본처럼 바뀌지는 않습니다. 현재 확장에는 다운로드·설치 폴더 쓰기나 별도 업데이트 프로그램을 추가하지 않았습니다.

## 자동 업데이트를 제공하려면

일반 사용자는 Chrome 웹 스토어에서 설치하는 방식이 적합합니다. 스토어에서 더 높은 버전을 게시하면 Chrome이 업데이트를 확인하고 적용합니다. 열려 있는 확장 페이지 등 사용 중인 구성 요소 때문에 적용 시점이 늦어질 수 있습니다.

Windows·macOS에서 자체 호스팅한 확장을 배포·갱신하려면 관리자가 제어하는 기업 정책 환경이 필요합니다. Linux는 별도의 자체 호스팅 배포를 지원하지만, 서명된 패키지와 업데이트 매니페스트를 사용하는 다른 배포 방식입니다. 현재 개발자 모드 ZIP 설치와 구분합니다.

기존 수동 설치본은 스토어 게시만으로 자동 전환되지 않습니다. 스토어 설치 시 확장 ID가 달라지면 기존 연결 정보와 테마가 자동 이전되지 않을 수 있습니다.

## 공식 자료

- [Chrome 확장 배포 방식](https://developer.chrome.com/docs/extensions/how-to/distribute)
- [개발자 모드 설치와 새로고침](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)
- [확장 업데이트 주기와 적용 조건](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle)
- [Linux 자체 호스팅](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux)
