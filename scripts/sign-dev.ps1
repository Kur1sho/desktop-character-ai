# Signs the development copy of Electron (and the built-in brain's native files)
# with your code-signing certificate, so `npm run dev` works on a PC with Smart
# App Control on. Uses the same signing.local.json as the installer build.
# Run it again after `npm install` (which can put a fresh, unsigned Electron back).
#
#   npm run sign:dev
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path 'signing.local.json')) {
  throw 'No signing.local.json yet: see docs/signing.md to set up your certificate first.'
}
$cfg = Get-Content 'signing.local.json' -Raw | ConvertFrom-Json

# Electron itself, and the brain's prebuilt Windows binaries.
$roots = @('node_modules\electron\dist') + (Get-ChildItem 'node_modules\@node-llama-cpp' -Directory -Filter 'win-*' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
$files = foreach ($r in $roots) {
  if (Test-Path $r) { Get-ChildItem $r -Recurse -File -Include *.exe, *.dll, *.node }
}
# Skip ones that already carry a valid signature (Microsoft's own DLLs, or signed last time).
$todo = @($files | Where-Object { (Get-AuthenticodeSignature $_.FullName).Status -ne 'Valid' } | ForEach-Object { $_.FullName })
if ($todo.Count -eq 0) { Write-Host 'Everything is already signed.'; exit 0 }
Write-Host "Signing $($todo.Count) files..."

if ($cfg.mode -eq 'azure') {
  # Microsoft's Artifact Signing (Trusted Signing) PowerShell module.
  if (-not (Get-Module -ListAvailable -Name TrustedSigning)) {
    Install-Module -Name TrustedSigning -Scope CurrentUser -Force
  }
  Invoke-TrustedSigning -Endpoint $cfg.endpoint -CodeSigningAccountName $cfg.codeSigningAccountName `
    -CertificateProfileName $cfg.certificateProfileName -Files ($todo -join ',') `
    -FileDigest SHA256 -TimestampRfc3161 'http://timestamp.acs.microsoft.com' -TimestampDigest SHA256
} elseif ($cfg.mode -eq 'certificate') {
  # signtool from the Windows SDK, or the copy electron-builder downloads.
  $signtool = @(
    Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue
    Get-ChildItem "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign\*\windows-10\x64\signtool.exe" -ErrorAction SilentlyContinue
  ) | Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $signtool) { throw 'signtool.exe not found: run "npm run dist" once (it downloads one), or install the Windows SDK.' }
  $ts = if ($cfg.timeStampServer) { $cfg.timeStampServer } else { 'http://timestamp.digicert.com' }
  $pick = if ($cfg.certificateSha1) { @('/sha1', $cfg.certificateSha1) } elseif ($cfg.certificateSubjectName) { @('/n', $cfg.certificateSubjectName) } else { @('/a') }
  foreach ($f in $todo) {
    & $signtool.FullName sign /fd sha256 /tr $ts /td sha256 @pick $f
    if ($LASTEXITCODE -ne 0) { throw "signtool failed on $f" }
  }
} else {
  throw 'signing.local.json needs "mode": "azure" or "certificate".'
}
Write-Host 'Done. npm run dev should start now.'
