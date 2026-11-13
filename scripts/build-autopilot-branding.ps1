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

    The script also writes the same package content, unencrypted, as one ZIP file with stored entries:
    public/win32-apps/autopilot-branding/content.zip. When the user customizes the configuration in the
    wizard, the web app builds the package in the browser from this file.
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
$contentZipPath = Join-Path -Path $resolvedOutputRoot -ChildPath 'autopilot-branding/content.zip'

function Assert-StoredZip {
    <#
    .SYNOPSIS
        Fails when a ZIP file has an entry that the web app cannot read.
    .DESCRIPTION
        The web app reads only stored (method 0) entries without data descriptors. Windows
        PowerShell 5.1 and PowerShell 7.2 or earlier write Deflate entries for
        CompressionLevel.NoCompression, so a file from those hosts must not be committed.
    #>
    param(
        [Parameter(Mandatory)]
        [string]$ZipPath
    )

    $bytes = [System.IO.File]::ReadAllBytes($ZipPath)
    $offset = 0
    $count = 0
    while ($offset + 30 -le $bytes.Length -and [System.BitConverter]::ToUInt32($bytes, $offset) -eq 0x04034b50) {
        $flags = [System.BitConverter]::ToUInt16($bytes, $offset + 6)
        $method = [System.BitConverter]::ToUInt16($bytes, $offset + 8)
        if ($method -ne 0 -or ($flags -band 0x08) -ne 0) {
            throw "The content ZIP has an entry that is not stored (method $method, flags $flags). Run this script with PowerShell 7.4 or later; older versions compress entries even with NoCompression."
        }
        $compressedSize = [System.BitConverter]::ToUInt32($bytes, $offset + 18)
        $nameLength = [System.BitConverter]::ToUInt16($bytes, $offset + 26)
        $extraLength = [System.BitConverter]::ToUInt16($bytes, $offset + 28)
        $offset += 30 + $nameLength + $extraLength + $compressedSize
        $count++
    }
    if ($count -eq 0) {
        throw "The content ZIP has no readable entry: $ZipPath"
    }
}

function Write-StoredContentZip {
    <#
    .SYNOPSIS
        Writes the unencrypted package content as one ZIP file with stored (uncompressed) entries.
    .DESCRIPTION
        The web app reads this file when the user customizes the configuration. It replaces the
        AutopilotBranding.json entry, then encrypts and wraps the content in the browser
        (lib/win32/autopilotBrandingPackage.ts). The entries are sorted and have a fixed time,
        so the same content gives the same file.
    #>
    param(
        [Parameter(Mandatory)]
        [string]$SourcePath,

        [Parameter(Mandatory)]
        [string]$ZipPath
    )

    Add-Type -AssemblyName System.IO.Compression
    $entryTime = [System.DateTimeOffset]::new(2026, 1, 1, 0, 0, 0, [System.TimeSpan]::Zero)
    $root = [System.IO.Path]::GetFullPath($SourcePath).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $files = @(Get-ChildItem -Path $SourcePath -Recurse -File | ForEach-Object {
            [PSCustomObject]@{
                Path = $_.FullName
                Name = $_.FullName.Substring($root.Length).Replace([System.IO.Path]::DirectorySeparatorChar, '/')
            }
        } | Sort-Object -Property Name -CaseSensitive)

    if (Test-Path -Path $ZipPath) {
        Remove-Item -Path $ZipPath -Force
    }
    $fileStream = [System.IO.File]::Open($ZipPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    try {
        $archive = [System.IO.Compression.ZipArchive]::new($fileStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
        try {
            foreach ($file in $files) {
                $entry = $archive.CreateEntry($file.Name, [System.IO.Compression.CompressionLevel]::NoCompression)
                $entry.LastWriteTime = $entryTime
                $entryStream = $entry.Open()
                try {
                    $sourceStream = [System.IO.File]::OpenRead($file.Path)
                    try {
                        $sourceStream.CopyTo($entryStream)
                    } finally {
                        $sourceStream.Dispose()
                    }
                } finally {
                    $entryStream.Dispose()
                }
            }
        } finally {
            $archive.Dispose()
        }
    } finally {
        $fileStream.Dispose()
    }
}

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
    Write-StoredContentZip -SourcePath $staging -ZipPath $contentZipPath
    Assert-StoredZip -ZipPath $contentZipPath

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
        ContentZip   = $contentZipPath
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
