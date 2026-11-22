# Recreates the tutorial stack from nothing (fresh database, test seed) so every recording starts from the same data.
#   pwsh tools/TutorialRecorder/stack/reset.ps1            # down -v, up -d, wait for the app
#   pwsh tools/TutorialRecorder/stack/reset.ps1 -Build     # also rebuild the images from the current source
#   pwsh tools/TutorialRecorder/stack/reset.ps1 -Down      # remove the stack and its volumes
# Example for a Docker Compose app: /mclip:init copies it to reset.ps1 and fills in the three values below.
param([switch]$Build, [switch]$Down, [string]$Url = 'http://localhost:5080')
$ErrorActionPreference = 'Stop'
$project = 'myapp-tutorial'                      # its own compose project, so its own volumes
$health = '/'                                    # a path that answers 200 once the app is up
$root = Resolve-Path (Join-Path $PSScriptRoot '../../..')
$compose = @('compose', '-p', $project, '-f', (Join-Path $root 'docker-compose.yml'), '-f', (Join-Path $PSScriptRoot 'docker-compose.tutorial.yml'))
Push-Location $root
try {
  & docker @compose down -v --remove-orphans
  if ($LASTEXITCODE -ne 0) { throw 'docker compose down failed' }
  if ($Down) { return }
  $up = @('up', '-d')
  if ($Build) { $up += '--build' }
  & docker @compose @up
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }
  $deadline = (Get-Date).AddMinutes(4)
  while ((Get-Date) -lt $deadline) {
    try { $r = Invoke-WebRequest "$Url$health" -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { Write-Host "ready: $Url"; return } } catch { }
    Start-Sleep -Seconds 3
  }
  throw "the tutorial stack did not answer at $Url within 4 minutes"
} finally { Pop-Location }
