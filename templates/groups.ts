/**
 * Dynamic and Static Group Templates for Intune Hydration Kit
 *
 * 50 dynamic groups across 6 categories (OS, Autopilot, Ownership,
 * Manufacturer, User, VM) plus 5 static assignment-ring groups.
 * Mirrors the PowerShell IntuneHydrationKit group templates.
 */

import { DeviceGroup } from "@/types/graph";

const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

// ---------------------------------------------------------------------------
// Dynamic Groups (50)
// ---------------------------------------------------------------------------

export const DYNAMIC_GROUPS: DeviceGroup[] = [
  // ── OS Groups (20) ──────────────────────────────────────────────────────

  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Windows Devices",
    description: `All Windows devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneWindowsDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "Windows") and (device.managementType -eq "MDM")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Windows 10 Devices",
    description: `All Windows 10 devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneWindows10Devices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "Windows") and (device.deviceOSVersion -startsWith "10.0.1") and (device.managementType -eq "MDM")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Windows 11 Devices",
    description: `All Windows 11 devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneWindows11Devices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "Windows") and (device.deviceOSVersion -startsWith "10.0.2") and (device.managementType -eq "MDM")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Windows ConfigMgr Managed Devices",
    description: `All Windows devices co-managed with Configuration Manager. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneWindowsConfigMgrManagedDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceManagementAppId -eq "54b943f8-d761-4f8d-951e-9cea1846db5a")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - macOS Devices",
    description: `All macOS devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneMacosDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -eq "MacMDM")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - macOS Corporate Devices",
    description: `All corporate-owned macOS devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneMacosCorporateDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "MacMDM") and (device.deviceOwnership -eq "Company")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - macOS BYOD Devices",
    description: `All personally owned macOS devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneMacosByodDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "MacMDM") and (device.deviceOwnership -eq "Personal")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - iOS iPadOS Devices",
    description: `All iOS and iPadOS devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneIosIpadosDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "iOS") or (device.deviceOSType -eq "iPad")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - iPhone Devices",
    description: `All iPhone devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneIphoneDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -eq "iPhone")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - iPhone Corporate Devices",
    description: `All corporate-owned iPhone devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneIphoneCorporateDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "iPhone") and (device.deviceOwnership -eq "Company")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - iPhone BYOD Devices",
    description: `All personally owned iPhone devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneIphoneByodDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "iPhone") and (device.deviceOwnership -eq "Personal")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - iPad Devices",
    description: `All iPad devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneIpadDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -eq "iPad")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - iPad Corporate Devices",
    description: `All corporate-owned iPad devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneIpadCorporateDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "iPad") and (device.deviceOwnership -eq "Company")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - iPad BYOD Devices",
    description: `All personally owned iPad devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneIpadByodDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "iPad") and (device.deviceOwnership -eq "Personal")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Android Devices",
    description: `All Android devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAndroidDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -match "Android")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Android Corporate Devices",
    description: `All corporate-owned Android devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAndroidCorporateDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "Android") and (device.deviceOwnership -eq "Company")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Android BYOD Devices",
    description: `All personally owned Android devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAndroidByodDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "Android") and (device.deviceOwnership -eq "Personal")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Android Enterprise Devices",
    description: `All Android Enterprise devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAndroidEnterpriseDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -match "AndroidEnterprise")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Android Work Profile Devices",
    description: `All Android Work Profile devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAndroidWorkProfileDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "AndroidForWork") and (device.managementType -eq "MDM")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Android Fully Managed Devices",
    description: `All Android Fully Managed (dedicated / COBO) devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAndroidFullyManagedDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "AndroidEnterprise") and (device.enrollmentProfileName -eq null)',
    membershipRuleProcessingState: "On",
  },

  // ── Autopilot Groups (2) ───────────────────────────────────────────────

  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Autopilot Devices",
    description: `All devices enrolled via Windows Autopilot. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAutopilotDevices",
    securityEnabled: true,
    membershipRule:
      '(device.devicePhysicalIDs -any (_ -startsWith "[ZTDID]"))',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Non-Autopilot Devices",
    description: `All Windows devices not enrolled via Autopilot. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneNonAutopilotDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceOSType -eq "Windows") and (device.devicePhysicalIDs -all (_ -notStartsWith "[ZTDID]"))',
    membershipRuleProcessingState: "On",
  },

  // ── Ownership Groups (2) ───────────────────────────────────────────────

  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Corporate Owned Devices",
    description: `All corporate-owned devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneCorporateOwnedDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOwnership -eq "Company")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - BYOD Devices",
    description: `All personally owned devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneByodDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOwnership -eq "Personal")',
    membershipRuleProcessingState: "On",
  },

  // ── Manufacturer Groups (5) ────────────────────────────────────────────

  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Dell Devices",
    description: `All Dell devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneDellDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceManufacturer -eq "Dell Inc.")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - HP Devices",
    description: `All HP and Hewlett-Packard devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneHpDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceManufacturer -eq "HP") or (device.deviceManufacturer -eq "Hewlett-Packard")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Lenovo Devices",
    description: `All Lenovo devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneLenovoDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceManufacturer -eq "LENOVO")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Microsoft Surface Devices",
    description: `All Microsoft Surface devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneMicrosoftSurfaceDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceManufacturer -eq "Microsoft Corporation") and (device.deviceModel -startsWith "Surface")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Apple Devices",
    description: `All Apple devices managed by Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAppleDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceManufacturer -eq "Apple")',
    membershipRuleProcessingState: "On",
  },

  // ── User Groups (9) ────────────────────────────────────────────────────

  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Update Ring Broad Users",
    description: `All Intune licensed users targeted for the broad phase of Windows Update for Business. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneUpdateRingBroadUsers",
    securityEnabled: true,
    membershipRule:
      '(user.assignedPlans -any (assignedPlan.servicePlanId -eq "c1ec4a95-1f05-45b3-a911-aa3fa01094f5" -and assignedPlan.capabilityStatus -eq "Enabled"))',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Entra - License - Business Premium",
    description: `Users with Microsoft 365 Business Premium (Defender for Business). ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "entraLicenseBusinessPremium",
    securityEnabled: true,
    membershipRule:
      '(user.assignedPlans -any (assignedPlan.servicePlanId -eq "4cde982a-aba4-4f86-8c9f-d6a9a8683f6e" -and assignedPlan.capabilityStatus -eq "Enabled"))',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Entra - License - E3",
    description: `Users with Microsoft 365 E3 or Office 365 E3 (Exchange Online Plan 2). ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "entraLicenseE3",
    securityEnabled: true,
    membershipRule:
      '(user.assignedPlans -any (assignedPlan.servicePlanId -eq "efb87545-963c-4e0d-99df-69c6916d9eb0" -and assignedPlan.capabilityStatus -eq "Enabled"))',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Entra - License - E5",
    description: `Users with Microsoft 365 E5 (Entra ID P2). ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "entraLicenseE5",
    securityEnabled: true,
    membershipRule:
      '(user.assignedPlans -any (assignedPlan.servicePlanId -eq "eec0eb4f-6444-4f95-aba0-50c24d67f998" -and assignedPlan.capabilityStatus -eq "Enabled"))',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Entra - License - F3",
    description: `Users with Microsoft 365 F3 (Exchange Kiosk + Intune). ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "entraLicenseF3",
    securityEnabled: true,
    membershipRule:
      '(user.assignedPlans -any (assignedPlan.servicePlanId -eq "4a82b400-a79f-41a4-b4e2-e94f5787b113" -and assignedPlan.capabilityStatus -eq "Enabled"))',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Entra - License - Copilot",
    description: `Users with Microsoft 365 Copilot. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "entraLicenseCopilot",
    securityEnabled: true,
    membershipRule:
      '(user.assignedPlans -any (assignedPlan.servicePlanId -eq "3f30311c-6b1e-48a4-ab79-725b469da960" -and assignedPlan.capabilityStatus -eq "Enabled"))',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Entra - License - Power BI Pro",
    description: `Users with Power BI Pro. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "entraLicensePowerBiPro",
    securityEnabled: true,
    membershipRule:
      '(user.assignedPlans -any (assignedPlan.servicePlanId -eq "70d33638-9c74-4d01-bfd3-562de28bd4ba" -and assignedPlan.capabilityStatus -eq "Enabled"))',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Entra - License - Visio",
    description: `Users with Visio Plan 2. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "entraLicenseVisio",
    securityEnabled: true,
    membershipRule:
      '(user.assignedPlans -any (assignedPlan.servicePlanId -eq "663a804f-1c30-4ff0-9915-9db84f0d1cea" -and assignedPlan.capabilityStatus -eq "Enabled"))',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Entra - License - Project",
    description: `Users with Project Plan 3 or higher. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "entraLicenseProject",
    securityEnabled: true,
    membershipRule:
      '(user.assignedPlans -any (assignedPlan.servicePlanId -eq "fafd7243-e5c1-4a3a-9e40-495efcb1d3c3" -and assignedPlan.capabilityStatus -eq "Enabled"))',
    membershipRuleProcessingState: "On",
  },

  // ── VM Groups (12) ─────────────────────────────────────────────────────

  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Azure Virtual Desktop (AVD) Devices",
    description: `All Azure Virtual Desktop VMs (model contains Virtual Machine). ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAzureVirtualDesktopAvdDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceModel -contains "Virtual Machine")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Azure Virtual Desktop (AVD) Named Devices",
    description: `Azure Virtual Desktop VMs with AVD- naming convention. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAzureVirtualDesktopAvdNamedDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceModel -contains "Virtual Machine") and (device.displayName -startsWith "AVD-")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Azure IaaS Virtual Machines",
    description: `All Azure IaaS VMs (Microsoft Corporation manufacturer with Virtual Machine model). ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAzureIaasVirtualMachines",
    securityEnabled: true,
    membershipRule:
      '(device.deviceManufacturer -eq "Microsoft Corporation") and (device.deviceModel -contains "Virtual Machine")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Windows 365 Cloud PC Devices",
    description: `All Windows 365 Cloud PC devices. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneWindows365CloudPcDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceModel -contains "Cloud PC")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Microsoft Dev Box Devices",
    description: `All Microsoft Dev Box devices. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneMicrosoftDevBoxDevices",
    securityEnabled: true,
    membershipRule:
      '(device.deviceManufacturer -contains "Microsoft") and (device.deviceModel -contains "Cloud")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Hyper-V Virtual Machines",
    description: `Hyper-V VMs (on-prem or nested) - may overlap with Azure VMs. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneHyperVVirtualMachines",
    securityEnabled: true,
    membershipRule:
      '(device.deviceManufacturer -eq "Microsoft Corporation") and (device.deviceModel -contains "Virtual")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - VMware Virtual Machines",
    description: `All VMware VMs (ESXi, Horizon, Workstation, Fusion). ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneVmwareVirtualMachines",
    securityEnabled: true,
    membershipRule: '(device.deviceManufacturer -contains "VMware")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - VirtualBox Virtual Machines",
    description: `All VirtualBox VMs. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneVirtualBoxVirtualMachines",
    securityEnabled: true,
    membershipRule: '(device.deviceModel -contains "VirtualBox")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Parallels Desktop Virtual Machines",
    description: `All Parallels Desktop VMs. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneParallelsDesktopVirtualMachines",
    securityEnabled: true,
    membershipRule: '(device.deviceManufacturer -contains "Parallels")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - QEMU KVM Virtual Machines",
    description: `All QEMU/KVM virtual machines. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneQemuKvmVirtualMachines",
    securityEnabled: true,
    membershipRule:
      '(device.deviceManufacturer -contains "QEMU") or (device.deviceModel -contains "KVM")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - All Virtual Machines",
    description: `Catch-all for all virtual machines - use for reporting only. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intuneAllVirtualMachines",
    securityEnabled: true,
    membershipRule:
      '(device.deviceModel -contains "Virtual") or (device.deviceModel -contains "Cloud PC") or (device.deviceManufacturer -contains "VMware") or (device.deviceManufacturer -contains "Parallels") or (device.deviceManufacturer -contains "QEMU")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Physical Devices Only",
    description: `Excludes all known virtual machines. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "intunePhysicalDevicesOnly",
    securityEnabled: true,
    membershipRule:
      '(device.deviceModel -notContains "Virtual") and (device.deviceModel -notContains "Cloud PC") and (device.deviceManufacturer -notContains "VMware") and (device.deviceManufacturer -notContains "Parallels") and (device.deviceManufacturer -notContains "QEMU")',
    membershipRuleProcessingState: "On",
  },
];

// ---------------------------------------------------------------------------
// Static Groups (5)
// ---------------------------------------------------------------------------

export const STATIC_GROUPS: DeviceGroup[] = [
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Assignment Ring Pilot Users",
    description: `Users targeted for the pilot phase of Windows Update for Business and Driver Updates. ${HYDRATION_MARKER}`,
    groupTypes: [],
    mailEnabled: false,
    mailNickname: "intuneAssignmentRingPilotUsers",
    securityEnabled: true,
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Assignment Ring UAT Users",
    description: `Users targeted for the UAT phase of Windows Update for Business and Driver Updates. ${HYDRATION_MARKER}`,
    groupTypes: [],
    mailEnabled: false,
    mailNickname: "intuneAssignmentRingUatUsers",
    securityEnabled: true,
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Assignment Ring Pilot Devices",
    description: `Devices targeted for the pilot assignment ring. ${HYDRATION_MARKER}`,
    groupTypes: [],
    mailEnabled: false,
    mailNickname: "intuneAssignmentRingPilotDevices",
    securityEnabled: true,
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Intune - Assignment Ring UAT Devices",
    description: `Devices targeted for the UAT assignment ring. ${HYDRATION_MARKER}`,
    groupTypes: [],
    mailEnabled: false,
    mailNickname: "intuneAssignmentRingUatDevices",
    securityEnabled: true,
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Windows Autopilot device preparation",
    description: `Autopilot device preparation assignment group. ${HYDRATION_MARKER}`,
    groupTypes: [],
    mailEnabled: false,
    mailNickname: "windowsAutopilotDevicePreparation",
    securityEnabled: true,
  },
];

// ---------------------------------------------------------------------------
// Getter functions
// ---------------------------------------------------------------------------

/**
 * Get all dynamic group templates
 */
export function getDynamicGroups(): DeviceGroup[] {
  return DYNAMIC_GROUPS;
}

/**
 * Get all static group templates
 */
export function getStaticGroups(): DeviceGroup[] {
  return STATIC_GROUPS;
}

/**
 * Get a specific dynamic group by display name (case-insensitive)
 */
export function getDynamicGroupByName(
  displayName: string,
): DeviceGroup | undefined {
  return DYNAMIC_GROUPS.find(
    (group) => group.displayName.toLowerCase() === displayName.toLowerCase(),
  );
}

/**
 * Get all group templates (dynamic + static combined)
 */
export function getAllGroups(): DeviceGroup[] {
  return [...DYNAMIC_GROUPS, ...STATIC_GROUPS];
}
