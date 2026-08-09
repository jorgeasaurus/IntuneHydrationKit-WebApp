[CmdletBinding()]
param(
    [Parameter()]
    [string]$ModuleRoot = (Join-Path -Path (Split-Path -Path $PSScriptRoot -Parent) -ChildPath '../IntuneHydrationKit'),

    [Parameter()]
    [string]$OutputRoot = (Join-Path -Path (Split-Path -Path $PSScriptRoot -Parent) -ChildPath 'public/win32-apps')
)

$ErrorActionPreference = 'Stop'
$resolvedModuleRoot = [System.IO.Path]::GetFullPath($ModuleRoot)
$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$moduleManifest = Join-Path -Path $resolvedModuleRoot -ChildPath 'IntuneHydrationKit.psd1'
$templatePath = Join-Path -Path $resolvedModuleRoot -ChildPath 'Templates/MobileApps/Windows/WinGet/Apps/7-zip.json'
$contentRoot = Join-Path -Path $resolvedOutputRoot -ChildPath '7-zip'
$packagePath = Join-Path -Path $resolvedOutputRoot -ChildPath '7-zip.intunewin'
$iconPath = Join-Path -Path $resolvedOutputRoot -ChildPath '7-zip.png'

foreach ($requiredPath in @($moduleManifest, $templatePath)) {
    if (-not (Test-Path -Path $requiredPath -PathType Leaf)) {
        throw "Required PowerShell module file was not found: $requiredPath"
    }
}

$module = Import-Module -Name $moduleManifest -Force -PassThru
& $module {
    param(
        [string]$TemplatePath,
        [string]$ContentRoot,
        [string]$PackagePath,
        [string]$IconPath
    )

    $template = Get-Content -Path $TemplatePath -Raw -ErrorAction Stop | ConvertFrom-Json -Depth 100
    $packageMetadata = New-WinGetPackageMetadataFromTemplate -Template $template

    if (Test-Path -Path $ContentRoot) {
        Remove-Item -Path $ContentRoot -Recurse -Force -ErrorAction Stop
    }
    $null = New-Item -Path $ContentRoot -ItemType Directory -Force
    $installScriptPath = Join-Path -Path $ContentRoot -ChildPath 'Install-WinGetPackage.ps1'
    $uninstallScriptPath = Join-Path -Path $ContentRoot -ChildPath 'Uninstall-WinGetPackage.ps1'
    $detectionScriptPath = Join-Path -Path $ContentRoot -ChildPath 'Detect-WinGetPackage.ps1'

    Set-Content -Path $installScriptPath -Value (Get-WinGetWrapperScriptContent -WingetCommand $template.install.command -PackageIdentifier $template.packageIdentifier -Operation Install) -Encoding utf8
    Set-Content -Path $uninstallScriptPath -Value (Get-WinGetWrapperScriptContent -WingetCommand $template.uninstall.command -PackageIdentifier $template.packageIdentifier -Operation Uninstall) -Encoding utf8
    Set-Content -Path $detectionScriptPath -Value (Get-WinGetDetectionScriptContent -PackageIdentifier $template.packageIdentifier -DisplayName $template.displayName -Publisher $template.publisher) -Encoding utf8
    $sourceIconPath = Join-Path -Path (Split-Path -Path $TemplatePath -Parent) -ChildPath ([string]$template.icon.fileName)
    if (-not (Test-Path -Path $sourceIconPath -PathType Leaf)) {
        throw "The WinGet template icon was not found: $sourceIconPath"
    }
    Copy-Item -Path $sourceIconPath -Destination $IconPath -Force

    $installCommandLine = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File .\Install-WinGetPackage.ps1'
    $uninstallCommandLine = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File .\Uninstall-WinGetPackage.ps1'
    $packageContext = New-IntuneWinPackagingContext -PackageMetadata $packageMetadata -SourcePath $ContentRoot -SetupFile 'Install-WinGetPackage.ps1' -OutputPath $PackagePath -InstallCommandLine $installCommandLine -UninstallCommandLine $uninstallCommandLine
    $package = New-IntuneWinPackage -PackagingContext $packageContext -Confirm:$false

    [PSCustomObject]@{
        PackagePath         = $package.OutputPath
        PackageIdentifier   = $packageMetadata.PackageIdentifier
        PackageVersion      = $packageMetadata.PackageVersion
        InstallScriptPath   = $installScriptPath
        UninstallScriptPath = $uninstallScriptPath
        DetectionScriptPath = $detectionScriptPath
        IconPath            = $IconPath
    }
} $templatePath $contentRoot $packagePath $iconPath
