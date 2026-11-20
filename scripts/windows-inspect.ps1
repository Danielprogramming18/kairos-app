param([Parameter(Mandatory)][string]$Directory, [Parameter(Mandatory)][string]$Report)
$ErrorActionPreference = 'Stop'
$files = @(Get-ChildItem -LiteralPath $Directory -File | Where-Object Extension -in '.exe','.msi')
if ($files.Count -ne 3) { throw 'Expected three binaries' }
$rows = @()
$reason = $null
$updated = $null
$updateError = $null
$fresh = $false
try {
    $status = Get-MpComputerStatus
    if (-not ($status.AMServiceEnabled -and $status.AntivirusEnabled)) { throw 'Defender engine inactive' }
    try { Update-MpSignature -ErrorAction Stop } catch { $updateError = $_.Exception.Message }
    $status = Get-MpComputerStatus
    if (-not ($status.AMServiceEnabled -and $status.AntivirusEnabled)) { throw 'Defender engine inactive after update attempt' }
    $updated = $status.AntivirusSignatureLastUpdated.ToUniversalTime()
    if (-not $status.AMEngineVersion -or -not $status.AntivirusSignatureVersion) { throw 'Engine or definition version unavailable' }
    $fresh = -not $status.DefenderSignaturesOutOfDate -and $updated -ge [DateTime]::UtcNow.AddDays(-2)
    $scanner = Join-Path $env:ProgramFiles 'Windows Defender/MpCmdRun.exe'
    if (-not (Test-Path -LiteralPath $scanner)) { throw 'Scanner unavailable' }
} catch { $reason = $_.Exception.Message }
foreach ($file in $files) {
    $row = [ordered]@{name=$file.Name; sha256=(Get-FileHash $file.FullName).Hash.ToLower(); authenticode=(Get-AuthenticodeSignature $file.FullName).Status.ToString(); scan='unavailable'}
    if (-not $reason) {
        $output = @(& $scanner -Scan -ScanType 3 -File $file.FullName -DisableRemediation 2>&1 | ForEach-Object { "$_" })
        $row.exit = $LASTEXITCODE
        $row.output = $output
        if ($row.exit -eq 0 -and ($output -match 'found no threats') -and -not ($output -match 'skipped|disabled')) { $row.scan = 'no-detection' }
        elseif ($row.exit -eq 2 -or ($output -match 'found [1-9]|threat\s*:')) { $row.scan = 'detected-or-scan-error' }
        else { $row.scan = 'inconclusive' }
        $row.threatIDs = @(Get-MpThreatDetection -ErrorAction SilentlyContinue |
            Where-Object {($_.Resources -join ' ').Contains($file.FullName)} | Select-Object -ExpandProperty ThreatID -Unique)
        if ($row.threatIDs.Count) {
            $row.scan = 'detected'
            $row.detections = @(Get-MpThreat -ErrorAction SilentlyContinue | Where-Object ThreatID -in $row.threatIDs | Select-Object ThreatID,ThreatName)
        }
    }
    $rows += [pscustomobject]$row
}
[ordered]@{at=[DateTime]::UtcNow; engine=$status.AMEngineVersion; signatures=$status.AntivirusSignatureVersion; updated=$updated; recentDefinitions=$fresh; updateError=$updateError; reason=$reason; files=$rows} |
    ConvertTo-Json -Depth 6 | Tee-Object -FilePath $Report
if ($rows.scan -match '^detected') { throw 'Review Defender detection or scan failure before distribution' }
