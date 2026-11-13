# Intune detection script for the Autopilot Branding Win32 app.
# AutopilotBranding.ps1 writes this tag file each time it runs, also when it makes no change
# because the device has already completed OOBE.
$programData = if ([string]::IsNullOrWhiteSpace($env:ProgramData)) { 'C:\ProgramData' } else { $env:ProgramData }
$tagFile = Join-Path -Path $programData -ChildPath 'Microsoft\AutopilotBranding\AutopilotBranding.ps1.tag'

if (Test-Path -LiteralPath $tagFile -PathType Leaf) {
    Write-Output "Autopilot Branding tag file found: $tagFile"
    exit 0
}

exit 1
