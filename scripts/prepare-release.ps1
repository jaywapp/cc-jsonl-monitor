$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $projectRoot 'dist\release'
$zipPath = Join-Path $releaseDir 'cc-jsonl-monitor-extension.zip'
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $manifestEntry = $archive.GetEntry('manifest.json')
    if ($null -eq $manifestEntry) { throw 'manifest.json must be at the ZIP root.' }
    $reader = New-Object IO.StreamReader($manifestEntry.Open())
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json }
    finally { $reader.Dispose() }
    if ($manifest.version -ne $package.version) { throw 'Package and extension versions must match.' }
    foreach ($entry in $archive.Entries) {
        if ($entry.FullName -notmatch '^(manifest\.json|background\.js|index\.html|icons/[^/]+\.png|assets/[^/]+\.(js|css))$') {
            throw "Unexpected file in extension ZIP: $($entry.FullName)"
        }
    }
    foreach ($required in @('background.js', 'index.html', 'icons/128.png')) {
        if ($null -eq $archive.GetEntry($required)) { throw "Missing extension file: $required" }
    }
} finally { $archive.Dispose() }

$utf8 = New-Object Text.UTF8Encoding($false)
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $releaseDir 'cc-jsonl-monitor-extension.zip.sha256'), "$hash  cc-jsonl-monitor-extension.zip`n", $utf8)
$metadata = @{ version = $manifest.version } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $releaseDir 'release.json'), $metadata, $utf8)
$notes = @'
기본 브랜치의 커밋에서 테스트와 빌드를 통과한 Chrome 확장입니다.

## 설치 방법

1. 아래 Assets에서 `cc-jsonl-monitor-extension.zip`을 다운로드하고 압축을 풉니다.
2. Chrome에서 `chrome://extensions`를 열고 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 누르고 `manifest.json`이 들어 있는 폴더를 선택합니다.
4. 확장 아이콘을 누르고 **폴더 연결** 또는 **파일 열기**로 JSONL을 선택합니다.

별도 서버나 Node.js 설치는 필요하지 않습니다. 설치 폴더는 삭제하지 않고 유지하세요. 기존 설치를 갱신할 때는 같은 폴더에 새 파일을 풀고 확장 관리 화면에서 새로고침합니다.

GitHub의 자동 생성 `Source code` 파일 대신 위 확장 ZIP을 사용하세요. SHA-256 확인 파일도 함께 첨부합니다. 이 릴리즈는 Chrome 웹 스토어 게시와 별개입니다.
'@
[IO.File]::WriteAllText((Join-Path $releaseDir 'release-notes.md'), $notes, $utf8)
Write-Output "Validated Chrome extension $($manifest.version)"
