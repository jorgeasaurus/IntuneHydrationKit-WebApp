<#
.SYNOPSIS
    Builds public/win32-apps/autopilot-branding.intunewin from a pinned AutopilotBranding checkout.
.DESCRIPTION
    AutopilotBranding (https://github.com/mtniehaus/AutopilotBranding, MIT License, Michael Niehaus)
    publishes no .intunewin file, so the kit builds its own package:

    1. The AutopilotBranding module generates the package content (New-ABOutput) from the kit's
       cleanup-only configuration, public/win32-apps/autopilot-branding/AutopilotBranding.json.
    2. The IntuneHydrationKit PowerShell module packages that content, with the same packager as
       the other Win32 apps in public/win32-apps.

    The package holds the AutopilotBranding module, its runner script, and the configuration.
    The cleanup-only configuration uses no asset files (wallpaper, theme, layouts).
.PARAMETER AutopilotBrandingRoot
    A checkout of mtniehaus/AutopilotBranding at the tag in -ExpectedVersion.
.PARAMETER ModuleRoot
    A checkout of the IntuneHydrationKit PowerShell module.
.PARAMETER ExpectedVersion
    AutopilotBranding module version that the web app template declares (templates/win32Apps.ts).
.EXAMPLE
    git clone --depth 1 --branch 4.0.7 https://github.com/mtniehaus/AutopilotBranding.git ../AutopilotBranding
    pwsh ./scripts/build-autopilot-branding.ps1 -AutopilotBrandingRoot ../AutopilotBranding
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$AutopilotBrandingRoot,

    [Parameter()]
    [string]$ModuleRoot = (Join-Path -Path (Split-Path -Path $PSScriptRoot -Parent) -ChildPath '../IntuneHydrationKit'),

    [Parameter()]
    [string]$OutputRoot = (Join-Path -Path (Split-Path -Path $PSScriptRoot -Parent) -ChildPath 'public/win32-apps'),

    [Parameter()]
    [string]$ExpectedVersion = '4.0.7'
)

$ErrorActionPreference = 'Stop'
$brandingRoot = [System.IO.Path]::GetFullPath($AutopilotBrandingRoot)
$brandingModule = Join-Path -Path $brandingRoot -ChildPath 'Module/AutopilotBranding'
$brandingManifest = Join-Path -Path $brandingModule -ChildPath 'AutopilotBranding.psd1'
$kitManifest = Join-Path -Path ([System.IO.Path]::GetFullPath($ModuleRoot)) -ChildPath 'IntuneHydrationKit.psd1'
$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$configPath = Join-Path -Path $resolvedOutputRoot -ChildPath 'autopilot-branding/AutopilotBranding.json'
$packagePath = Join-Path -Path $resolvedOutputRoot -ChildPath 'autopilot-branding.intunewin'
$licensePath = Join-Path -Path $resolvedOutputRoot -ChildPath 'autopilot-branding/LICENSE-AutopilotBranding.txt'

foreach ($requiredPath in @($brandingManifest, $kitManifest, $configPath)) {
    if (-not (Test-Path -Path $requiredPath -PathType Leaf)) {
        throw "Required file was not found: $requiredPath"
    }
}

$brandingVersion = [string](Import-PowerShellDataFile -Path $brandingManifest).ModuleVersion
if ($brandingVersion -ne $ExpectedVersion) {
    throw "AutopilotBranding is version $brandingVersion; expected $ExpectedVersion. Check out the matching tag, or update the version in templates/win32Apps.ts and pass -ExpectedVersion."
}

$staging = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath "ihk-autopilot-branding-$([guid]::NewGuid().ToString('N'))"
try {
    Import-Module -Name $brandingManifest -Force
    $configuration = Read-ABConfiguration -Path $configPath
    # BasePath is the template folder: the cleanup-only configuration enables no task that uses a file.
    $output = New-ABOutput -Configuration $configuration -BasePath (Get-ABTemplatePath) -OutputPath $staging -Force
    if (@($output.Assets).Count -gt 0) {
        throw "The cleanup-only configuration must not package asset files, but it uses: $(@($output.Assets) -join ', ')"
    }
    # New-ABOutput creates an empty Assets folder. An empty folder cannot be in the package.
    $assetFolder = Join-Path -Path $staging -ChildPath 'Assets'
    if ((Test-Path -Path $assetFolder) -and -not (Get-ChildItem -Path $assetFolder -Force)) {
        Remove-Item -Path $assetFolder -Force
    }
    Copy-Item -Path (Join-Path -Path $brandingRoot -ChildPath 'LICENSE') -Destination (Join-Path -Path $staging -ChildPath 'LICENSE-AutopilotBranding.txt') -Force
    Copy-Item -Path (Join-Path -Path $brandingRoot -ChildPath 'LICENSE') -Destination $licensePath -Force
    # The template catalog shows the script that the install command runs.
    Copy-Item -Path (Join-Path -Path $staging -ChildPath 'AutopilotBranding.ps1') -Destination (Join-Path -Path $resolvedOutputRoot -ChildPath 'autopilot-branding/AutopilotBranding.ps1') -Force

    $kitModule = Import-Module -Name $kitManifest -Force -PassThru
    $package = & $kitModule {
        param([string]$SourcePath, [string]$PackagePath, [string]$Version)

        $packageMetadata = [PSCustomObject]@{
            PackageIdentifier = 'mtniehaus.AutopilotBranding'
            PackageVersion    = $Version
            DisplayName       = 'Autopilot Branding'
            Publisher         = 'Michael Niehaus'
            SelectedInstaller = $null
            ManifestSource    = $null
        }
        $packageContext = New-IntuneWinPackagingContext -PackageMetadata $packageMetadata -SourcePath $SourcePath `
            -SetupFile 'AutopilotBranding.ps1' -OutputPath $PackagePath `
            -InstallCommandLine 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\AutopilotBranding.ps1' `
            -UninstallCommandLine 'cmd.exe /c del %ProgramData%\Microsoft\AutopilotBranding\AutopilotBranding.ps1.tag'
        New-IntuneWinPackage -PackagingContext $packageContext -Confirm:$false
    } $staging $packagePath $brandingVersion

    [PSCustomObject]@{
        PackagePath  = $package.OutputPath
        Version      = $brandingVersion
        EnabledTasks = @($output.EnabledTasks)
        Files        = @(Get-ChildItem -Path $staging -Recurse -File).Count
        SizeBytes    = (Get-Item -Path $packagePath).Length
    }
} finally {
    if (Test-Path -Path $staging) {
        Remove-Item -Path $staging -Recurse -Force
    }
}
