$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$extensionDir = Join-Path $projectRoot 'dist\extension'
$releaseDir = Join-Path $projectRoot 'dist\release'
if (-not (Test-Path -LiteralPath (Join-Path $extensionDir 'manifest.json'))) {
    throw 'Build the extension before packaging.'
}
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
$zipPath = Join-Path $releaseDir 'cc-jsonl-monitor-extension.zip'
Compress-Archive -Path (Join-Path $extensionDir '*') -DestinationPath $zipPath -Force
Write-Output $zipPath
