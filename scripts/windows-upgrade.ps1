# Installs into an ephemeral Actions runner. Never run against a user's profile.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Disposable hosted runner required' }
$out = New-Item -Type Directory -Force windows-evidence
$old = New-Item -Type Directory -Force (Join-Path $env:RUNNER_TEMP 'kairos-original')
$zip = Join-Path $env:RUNNER_TEMP 'kairos-221.zip'
$url = 'https://api.github.com/repos/Danielprogramming18/kairos-app/actions/artifacts/14539894353/zip'
$report = [ordered]@{status='pending'; observations=@()}
try {
    Invoke-WebRequest -Uri $url -Headers @{Authorization="Bearer $env:GH_TOKEN"} -OutFile $zip
    if ((Get-FileHash $zip).Hash -ne '5442525ad929c288899fcc7bfeb14c5e15beeb43be70c8b28659d61cc9c2fa7d') { throw 'Original archive hash mismatch' }
    Expand-Archive -LiteralPath $zip -DestinationPath $old
    $oldReport = Join-Path $out 'original.json'
    & "$PSScriptRoot/windows-inspect.ps1" -Directory $old -Report $oldReport
    $original = Get-Content $oldReport -Raw | ConvertFrom-Json
    $new = Get-Content windows-installer-artifacts/inspection.json -Raw | ConvertFrom-Json
    # The scan reports retain any limitations. Run the owned, hash-verified builds only
    # in this ephemeral profile; a detection from either inspection already fails the step.
    $report.scanCoverage = @($original.files.scan + $new.files.scan)
    Remove-Item Env:GH_TOKEN
    $db = Join-Path $env:LOCALAPPDATA 'com.kairos.workspace/data/kairos_v2.sqlite'
    if (Test-Path -LiteralPath $db) { throw 'Expected a fresh test profile' }
    $wv = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft/EdgeWebView/Application'
    $report.preinstalledWebView2 = @(Get-ChildItem $wv -Filter msedgewebview2.exe -Recurse -ErrorAction SilentlyContinue).Count -gt 0
    foreach ($step in @(@{dir=$old.FullName; version='2.2.1'},@{dir='windows-installer-artifacts'; version='2.2.2'})) {
        $setup = Join-Path $step.dir ("Kairos_"+$step.version+"_x64-setup.exe")
        $install = Start-Process -FilePath $setup -ArgumentList '/S' -PassThru -WindowStyle Hidden
        if (-not $install.WaitForExit(120000) -or $install.ExitCode -ne 0) { throw 'NSIS installation failed' }
        $exe = Join-Path $env:LOCALAPPDATA 'Kairos/kairos-desktop.exe'
        if ((Get-FileHash $exe).Hash -ne (Get-FileHash (Join-Path $step.dir 'kairos-desktop.exe')).Hash) { throw 'Installed binary hash mismatch' }
        $app = Start-Process -FilePath $exe -PassThru -WindowStyle Hidden
        $seen = @()
        $sockets = @()
        for ($i=0; $i -lt 6; $i++) {
            Start-Sleep -Seconds 1
            $processes = @(Get-CimInstance Win32_Process)
            $ids = @($app.Id)
            do {
                $children = @($processes | Where-Object {$_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids})
                $ids += @($children | ForEach-Object ProcessId)
            } while ($children.Count)
            $seen += @($processes | Where-Object ProcessId -in $ids | ForEach-Object Name)
            $sockets += @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object OwningProcess -in $ids | Select-Object RemoteAddress,RemotePort)
        }
        if ($app.HasExited -or -not (Test-Path $db)) { throw 'Native app did not stay running and open its expected database' }
        $report.observations += @{version=$step.version; processes=@($seen | Sort-Object -Unique); sampledConnections=$sockets; hash=(Get-FileHash $exe).Hash}
        $null = $app.CloseMainWindow()
        if (-not $app.WaitForExit(4000)) { $app.Kill(); $app.WaitForExit() }
        $env:KAIROS_UPGRADE_DB=$db
        if ($step.version -eq '2.2.1') {
            python -c "import os,sqlite3,json; d=sqlite3.connect(os.environ['KAIROS_UPGRADE_DB']); d.execute('INSERT INTO notes(id,kind,updated_at,json_data) VALUES (?,?,?,?)',('security-qa','idea','2026-01-01T00:00:00.000Z',json.dumps(dict(id='security-qa',title='sample')))); d.commit()"
        } else {
            python -c "import os,sqlite3,json; d=sqlite3.connect(os.environ['KAIROS_UPGRADE_DB']); assert d.execute('PRAGMA integrity_check').fetchone()==('ok',); assert json.loads(d.execute('SELECT json_data FROM notes WHERE id=?',('security-qa',)).fetchone()[0])['title']=='sample'"
        }
        if ($LASTEXITCODE -ne 0) { throw 'SQLite upgrade sentinel check failed' }
    }
    $report.status = 'passed'
} catch {
    $report.status = 'failed'
    $report.reason = $_.Exception.Message
    throw
} finally {
    $report | ConvertTo-Json -Depth 6 | Tee-Object -FilePath (Join-Path $out 'upgrade.json')
}
