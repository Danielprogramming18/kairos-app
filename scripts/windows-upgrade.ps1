# Installs into an ephemeral Actions runner. Never run against a user's profile.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Disposable hosted runner required' }
$out = New-Item -Type Directory -Force windows-evidence
$old = New-Item -Type Directory -Force (Join-Path $env:RUNNER_TEMP 'kairos-original')
$zip = Join-Path $env:RUNNER_TEMP 'kairos-221.zip'
$url = 'https://api.github.com/repos/Danielprogramming18/kairos-app/actions/artifacts/14539894353/zip'
$report = [ordered]@{status='pending'; observations=@()}
function Get-StartupEntries {
    foreach ($key in @('HKCU:/Software/Microsoft/Windows/CurrentVersion/Run','HKLM:/Software/Microsoft/Windows/CurrentVersion/Run')) {
        if (Test-Path $key) {
            foreach ($name in (Get-Item $key).GetValueNames()) { "$key/$name" }
        }
    }
}
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
    $startupBefore = @(Get-StartupEntries)
    $servicesBefore = @((Get-Service).Name)
    foreach ($step in @(@{dir=$old.FullName; version='2.2.1'},@{dir='windows-installer-artifacts'; version='2.2.2'})) {
        $setup = Join-Path $step.dir ("Kairos_"+$step.version+"_x64-setup.exe")
        $payloadDir = Join-Path $env:RUNNER_TEMP ("kairos-nsis-"+$step.version)
        & 7z e -y '-ir!kairos-desktop.exe' "-o$payloadDir" $setup
        if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the NSIS payload' }
        $payload = Join-Path $payloadDir 'kairos-desktop.exe'
        $standalone = Join-Path $step.dir 'kairos-desktop.exe'
        # Tauri sets the bundle type in each installer. Check the whole byte sequence;
        # do not alter either executable or ignore arbitrary byte ranges.
        python -c "import pathlib,sys; a,b=(pathlib.Path(x).read_bytes() for x in sys.argv[1:]); marker=b'__TAURI_BUNDLE_TYPE_VAR_'; assert a==b or (a.count(marker+b'UNK')==1 and a.replace(marker+b'UNK',marker+b'NSS',1)==b), 'Unexpected NSIS payload bytes'" $standalone $payload
        if ($LASTEXITCODE -ne 0) { throw 'NSIS payload does not correspond to the standalone build' }
        $payloadHash = (Get-FileHash -LiteralPath $payload).Hash
        $install = Start-Process -FilePath $setup -ArgumentList '/S' -PassThru -WindowStyle Hidden
        if (-not $install.WaitForExit(120000) -or $install.ExitCode -ne 0) { throw 'NSIS installation failed' }
        $exe = Join-Path $env:LOCALAPPDATA 'Kairos/kairos-desktop.exe'
        if ((Get-FileHash $exe).Hash -ne $payloadHash) { throw 'Installed binary differs from the verified NSIS payload' }
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
        $report.observations += @{version=$step.version; processes=@($seen | Sort-Object -Unique); sampledConnections=$sockets; installedHash=$payloadHash; standaloneHash=(Get-FileHash $standalone).Hash}
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
    $report.addedStartupEntries = @(Get-StartupEntries | Where-Object { $_ -notin $startupBefore })
    $report.addedServices = @((Get-Service).Name | Where-Object { $_ -notin $servicesBefore })
    $report.installDirectory = 'LocalAppData/Kairos'
    $report.dataFile = 'LocalAppData/com.kairos.workspace/data/kairos_v2.sqlite'
    $report.status = 'passed'
} catch {
    $report.status = 'failed'
    $report.reason = $_.Exception.Message
    throw
} finally {
    $report | ConvertTo-Json -Depth 6 | Tee-Object -FilePath (Join-Path $out 'upgrade.json')
}
