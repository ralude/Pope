param()

# T15 · REQ-003-02/63. Desarrollo local: un servicio demand propio y retirada en finally.
# La elevación la confirma Windows; no cambia cuentas, UAC, shell ni servicios preexistentes.
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
try {
    if ($identity.IsSystem -or ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Ejecuta el lanzador desde PowerShell sin elevar; UAC solo eleva el instalador temporal.'
    }
} finally { $identity.Dispose() }
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$agent = Join-Path $taskRoot 'apps/native/dist/agent/Pope.Agent.exe'
$probe = Join-Path $taskRoot 'apps/native/dist/probe/Pope.DesktopProbe.exe'
if (!(Test-Path -LiteralPath $agent) -or !(Test-Path -LiteralPath $probe)) {
    throw 'Publica primero Agent y DesktopProbe con el SDK fijado.'
}
$trialId = [Guid]::NewGuid().ToString('N')
$evidence = Join-Path $taskRoot "tmp/agent-service-$trialId"
if (Test-Path -LiteralPath $evidence) { throw 'El identificador ya existe.' }
New-Item -ItemType Directory -Path $evidence | Out-Null
[IO.File]::WriteAllText((Join-Path $evidence 'prepared'), $trialId)
$manifest = [ordered]@{
    Id = $trialId
    ServiceName = "Pope.Agent.Test.$trialId"
    ProtectedRoot = Join-Path $env:ProgramData "PopeAgentTest-$trialId"
    AgentSha256 = (Get-FileHash -LiteralPath $agent -Algorithm SHA256).Hash
    ProbeSha256 = (Get-FileHash -LiteralPath $probe -Algorithm SHA256).Hash
    WindowsVersion = [Environment]::OSVersion.VersionString
    Utc = [DateTime]::UtcNow.ToString('O')
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'manifest.json')
Write-Output "Ensayo T15: $trialId. Evidencia: $evidence"
Write-Output 'Windows solicitará UAC para el ensayo temporal LocalSystem; la comprobación de denegación usa este token medio.'
$installer = Start-Process -FilePath $probe -ArgumentList @('--agent-service-probe', $trialId) -Verb RunAs -WindowStyle Hidden -PassThru
$deadline = [Diagnostics.Stopwatch]::StartNew()
$denialExecuted = $false
while (!(Test-Path -LiteralPath (Join-Path $evidence 'finished'))) {
    if (!$denialExecuted -and (Test-Path -LiteralPath (Join-Path $evidence 'ready-denial'))) {
        & $probe --agent-service-denial $trialId
        if ($LASTEXITCODE -ne 0) { throw 'El token medio no confirmó la denegación; el instalador retirará el servicio.' }
        $denialExecuted = $true
    }
    if ($deadline.Elapsed.TotalSeconds -gt 150 -or $installer.HasExited) {
        throw "El ensayo no produjo informe. Revisa $evidence; no inferir retirada sin evidencia."
    }
    Start-Sleep -Milliseconds 200
}
$report = Get-Content -LiteralPath (Join-Path $evidence 'report.json') -Raw | ConvertFrom-Json
$report | ConvertTo-Json -Depth 5
if (!$report.Passed -or !$report.ServiceRemoved -or !$report.RootRemoved) { exit 1 }
exit 0
