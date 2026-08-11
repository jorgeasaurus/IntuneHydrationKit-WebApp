#Requires -Version 7.0

<#
.SYNOPSIS
Checks a tenant for duplicate Intune Hydration Kit objects after create operations.

.DESCRIPTION
Connects to Microsoft Graph and queries the main Intune Hydration Kit object
categories. Any object with an [IHD] display-name/name prefix or the
"Imported by Intune Hydration Kit" description marker is grouped by normalized
name within its category. Groups with more than one matching object are reported
as duplicates.

Conditional Access policies are matched by [IHD] prefix only because they do
not support descriptions.

.PARAMETER TenantId
Microsoft Entra tenant ID to query.

.PARAMETER UseDeviceCode
Uses device-code authentication instead of the default interactive browser flow.

.PARAMETER IncludeItems
Includes the matching duplicate item details in the returned object output.

.EXAMPLE
./scripts/Test-IHDDuplicateState.ps1 -TenantId '00000000-0000-0000-0000-000000000000' -UseDeviceCode
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId,

    [switch]$UseDeviceCode,

    [switch]$IncludeItems
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$HydrationPrefix = '[IHD] '
$HydrationMarker = 'Imported by Intune Hydration Kit'
$RequiredScopes = @(
    'Group.Read.All',
    'DeviceManagementConfiguration.Read.All',
    'DeviceManagementServiceConfig.Read.All',
    'DeviceManagementApps.Read.All',
    'Policy.Read.All',
    'Policy.Read.ConditionalAccess'
)

function Connect-IHDGraph {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$TenantId,

        [Parameter(Mandatory)]
        [string[]]$Scopes,

        [switch]$UseDeviceCode
    )

    $context = Get-MgContext -ErrorAction SilentlyContinue
    if ($context -and $context.TenantId -eq $TenantId) {
        Write-Verbose "Using existing Microsoft Graph context for tenant $TenantId."
        return
    }

    $connectParams = @{
        TenantId  = $TenantId
        Scopes    = $Scopes
        NoWelcome = $true
    }

    if ($UseDeviceCode) {
        $connectParams.UseDeviceCode = $true
    }

    Connect-MgGraph @connectParams | Out-Null
}

function Get-IHDPropertyValue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$InputObject,

        [Parameter(Mandatory)]
        [string]$PropertyName
    )

    if ($null -eq $InputObject) {
        return $null
    }

    $property = $InputObject.PSObject.Properties.Match($PropertyName)
    if ($null -eq $property -or $property.Count -eq 0) {
        return $null
    }

    return $property[0].Value
}

function Get-IHDGraphCollection {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Uri
    )

    $items = New-Object System.Collections.Generic.List[object]
    $nextLink = $Uri

    while ($nextLink) {
        Write-Verbose "Querying $nextLink"
        $response = Invoke-MgGraphRequest -Method GET -Uri $nextLink -OutputType PSObject
        $responseItems = Get-IHDPropertyValue -InputObject $response -PropertyName 'value'
        $responseNextLink = Get-IHDPropertyValue -InputObject $response -PropertyName '@odata.nextLink'

        if ($null -ne $responseItems) {
            foreach ($item in $responseItems) {
                $items.Add($item)
            }

            $nextLink = $responseNextLink
            continue
        }

        $items.Add($response)
        $nextLink = $null
    }

    return $items.ToArray()
}

function Test-IHDMarker {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Name,

        [AllowEmptyString()]
        [string]$Description,

        [switch]$NameOnly
    )

    if ($Name.StartsWith($HydrationPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }

    if ($NameOnly) {
        return $false
    }

    return $Description -like "*$HydrationMarker*"
}

function Normalize-IHDName {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Name
    )

    return (($Name -replace '\s+', ' ').Trim()).ToLowerInvariant()
}

function Get-IHDSum {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [object[]]$InputObject,

        [Parameter(Mandatory)]
        [string]$PropertyName
    )

    if (@($InputObject).Count -eq 0) {
        return 0
    }

    $measure = $InputObject | Measure-Object -Property $PropertyName -Sum
    if ($null -eq $measure -or $null -eq $measure.Sum) {
        return 0
    }

    return [int]$measure.Sum
}

function Get-IHDDuplicateCategoryResult {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Category,

        [Parameter(Mandatory)]
        [string]$Uri,

        [Parameter(Mandatory)]
        [ValidateSet('displayName', 'name')]
        [string]$NameProperty,

        [string]$DescriptionProperty = 'description',

        [switch]$NameOnly
    )

    try {
        $items = Get-IHDGraphCollection -Uri $Uri

        $matches = @(
            foreach ($item in $items) {
                $nameValue = Get-IHDPropertyValue -InputObject $item -PropertyName $NameProperty
                $descriptionValue = if ($DescriptionProperty) {
                    Get-IHDPropertyValue -InputObject $item -PropertyName $DescriptionProperty
                }
                else {
                    $null
                }

                $name = [string]($nameValue ?? '')
                $description = [string]($descriptionValue ?? '')

                if (-not (Test-IHDMarker -Name $name -Description $description -NameOnly:$NameOnly)) {
                    continue
                }

                [PSCustomObject]@{
                    Id             = [string]((Get-IHDPropertyValue -InputObject $item -PropertyName 'id') ?? '')
                    Name           = $name
                    NormalizedName = Normalize-IHDName -Name $name
                    Description    = $description
                    State          = [string]((Get-IHDPropertyValue -InputObject $item -PropertyName 'state') ?? '')
                }
            }
        )

        $duplicateGroups = @(
            $matches |
                Group-Object -Property NormalizedName |
                Where-Object { $_.Count -gt 1 } |
                ForEach-Object {
                    $groupItems = @($_.Group | Sort-Object -Property Name, Id)
                    [PSCustomObject]@{
                        Name           = $groupItems[0].Name
                        DuplicateCount = $groupItems.Count
                        Items          = $groupItems
                    }
                }
        )

        [PSCustomObject]@{
            PSTypeName          = 'IntuneHydrationKit.DuplicateCheck.CategoryResult'
            Category            = $Category
            DuplicateGroupCount = $duplicateGroups.Count
            DuplicateItemCount  = Get-IHDSum -InputObject $duplicateGroups -PropertyName 'DuplicateCount'
            Duplicates          = $duplicateGroups
            Error               = $null
        }
    }
    catch {
        Write-Warning "Failed to query $Category`: $($_.Exception.Message)"
        [PSCustomObject]@{
            PSTypeName          = 'IntuneHydrationKit.DuplicateCheck.CategoryResult'
            Category            = $Category
            DuplicateGroupCount = 0
            DuplicateItemCount  = 0
            Duplicates          = @()
            Error               = $_.Exception.Message
        }
    }
}

$categoryChecks = @(
    @{ Category = 'Groups'; Uri = 'https://graph.microsoft.com/v1.0/groups?$select=id,displayName,description'; NameProperty = 'displayName' }
    @{ Category = 'Device Filters'; Uri = 'https://graph.microsoft.com/beta/deviceManagement/assignmentFilters?$select=id,displayName,description'; NameProperty = 'displayName' }
    @{ Category = 'Settings Catalog / Device Preparation'; Uri = 'https://graph.microsoft.com/beta/deviceManagement/configurationPolicies?$select=id,name,description'; NameProperty = 'name' }
    @{ Category = 'Administrative Templates'; Uri = 'https://graph.microsoft.com/beta/deviceManagement/groupPolicyConfigurations?$select=id,displayName,description'; NameProperty = 'displayName' }
    @{ Category = 'Device Configurations'; Uri = 'https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations?$select=id,displayName,description'; NameProperty = 'displayName' }
    @{ Category = 'V1 Compliance Policies'; Uri = 'https://graph.microsoft.com/beta/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description'; NameProperty = 'displayName' }
    @{ Category = 'V2 Compliance Policies'; Uri = 'https://graph.microsoft.com/beta/deviceManagement/compliancePolicies?$select=id,name,description'; NameProperty = 'name' }
    @{ Category = 'Driver Update Profiles'; Uri = 'https://graph.microsoft.com/beta/deviceManagement/windowsDriverUpdateProfiles?$select=id,displayName,description'; NameProperty = 'displayName' }
    @{ Category = 'iOS App Protection'; Uri = 'https://graph.microsoft.com/beta/deviceAppManagement/iosManagedAppProtections?$select=id,displayName,description'; NameProperty = 'displayName' }
    @{ Category = 'Android App Protection'; Uri = 'https://graph.microsoft.com/beta/deviceAppManagement/androidManagedAppProtections?$select=id,displayName,description'; NameProperty = 'displayName' }
    @{ Category = 'Autopilot Profiles'; Uri = 'https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeploymentProfiles?$select=id,displayName,description'; NameProperty = 'displayName' }
    @{ Category = 'Enrollment Status Page'; Uri = 'https://graph.microsoft.com/beta/deviceManagement/deviceEnrollmentConfigurations?$select=id,displayName,description'; NameProperty = 'displayName' }
    @{ Category = 'Conditional Access Policies'; Uri = 'https://graph.microsoft.com/beta/identity/conditionalAccess/policies?$select=id,displayName,state'; NameProperty = 'displayName'; NameOnly = $true; DescriptionProperty = '' }
)

Connect-IHDGraph -TenantId $TenantId -Scopes $RequiredScopes -UseDeviceCode:$UseDeviceCode

$results = @(foreach ($category in $categoryChecks) {
    $params = @{
        Category     = $category.Category
        Uri          = $category.Uri
        NameProperty = $category.NameProperty
    }

    if ($category.ContainsKey('DescriptionProperty')) {
        $params.DescriptionProperty = $category.DescriptionProperty
    }

    if ($category.ContainsKey('NameOnly') -and $category.NameOnly) {
        $params.NameOnly = $true
    }

    Get-IHDDuplicateCategoryResult @params
})

$summary = @(foreach ($result in $results) {
    [PSCustomObject]@{
        Category            = $result.Category
        DuplicateGroups     = $result.DuplicateGroupCount
        DuplicateItems      = $result.DuplicateItemCount
        Status              = if ($result.Error) { 'Error' } elseif ($result.DuplicateGroupCount -eq 0) { 'Clear' } else { 'DuplicatesFound' }
        Error               = $result.Error
    }
})

$totalDuplicateGroups = Get-IHDSum -InputObject $summary -PropertyName 'DuplicateGroups'
$totalDuplicateItems = Get-IHDSum -InputObject $summary -PropertyName 'DuplicateItems'
$hasNoDuplicates = (@($summary | Where-Object { $_.Status -eq 'DuplicatesFound' })).Count -eq 0 -and
    (@($summary | Where-Object { $_.Status -eq 'Error' })).Count -eq 0

Write-Host ''
Write-Host 'Intune Hydration Kit duplicate check' -ForegroundColor Cyan
Write-Host "Tenant: $TenantId"
Write-Host ''
$summary | Format-Table -AutoSize | Out-Host

if ($totalDuplicateGroups -gt 0) {
    Write-Host ''
    Write-Host 'Duplicate groups:' -ForegroundColor Yellow
    foreach ($result in $results | Where-Object { $_.DuplicateGroupCount -gt 0 }) {
        Write-Host ''
        Write-Host "[$($result.Category)]" -ForegroundColor Yellow
        foreach ($duplicate in $result.Duplicates) {
            Write-Host " - $($duplicate.Name) ($($duplicate.DuplicateCount) copies)"
            foreach ($item in $duplicate.Items) {
                if ([string]::IsNullOrWhiteSpace($item.State)) {
                    Write-Host "   * $($item.Id)"
                }
                else {
                    Write-Host "   * $($item.Id) (state: $($item.State))"
                }
            }
        }
    }
}

[PSCustomObject]@{
    PSTypeName           = 'IntuneHydrationKit.DuplicateCheck.Summary'
    TenantId             = $TenantId
    NoDuplicates         = $hasNoDuplicates
    TotalDuplicateGroups = $totalDuplicateGroups
    TotalDuplicateItems  = $totalDuplicateItems
    Categories           = $summary
    Results              = if ($IncludeItems) { $results } else { @() }
}
