import { describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import {
  createAndroidAppProtectionPolicy,
  createiOSAppProtectionPolicy,
  normalizeAppProtectionPolicyForCreate,
} from "@/lib/graph/appProtection";
import type { AppProtectionPolicy } from "@/types/graph";
import androidByodTemplate from "@/public/IntuneTemplates/AppProtection/Android - Baseline - BYOD - App Protection.json";
import iosByodTemplate from "@/public/IntuneTemplates/AppProtection/iOS - Baseline - BYOD - App Protection.json";
import { HYDRATION_MARKER } from "@/lib/utils/hydrationMarker";

describe("appProtection create normalization", () => {
  it("removes export-only Android BYOD fields before create", () => {
    const normalized = normalizeAppProtectionPolicyForCreate(
      androidByodTemplate as AppProtectionPolicy
    );

    expect(normalized.displayName).toBe("Android - Baseline - BYOD - App Protection");
    expect(normalized.description).toBe(HYDRATION_MARKER);
    expect(normalized.roleScopeTagIds).toEqual(["0"]);
    expect(normalized.appGroupType).toBe("allMicrosoftApps");
    expect(normalized.requiredAndroidSafetyNetEvaluationType).toBe("hardwareBacked");

    expect(normalized).not.toHaveProperty("@odata.context");
    expect(normalized).not.toHaveProperty("id");
    expect(normalized).not.toHaveProperty("version");
    expect(normalized).not.toHaveProperty("isAssigned");
    expect(normalized).not.toHaveProperty("deployedAppCount");
    expect(normalized).not.toHaveProperty("apps");
    expect(normalized).not.toHaveProperty("assignments");
    expect(normalized).not.toHaveProperty("targetedAppManagementLevels");
    expect(normalized).not.toHaveProperty("minimumRequiredPatchVersion");
    expect(normalized).not.toHaveProperty("minimumWarningPatchVersion");
    expect(normalized).not.toHaveProperty("minimumWipePatchVersion");
    expect(normalized).not.toHaveProperty("customBrowserPackageId");
    expect(normalized).not.toHaveProperty("customDialerAppPackageId");
    expect(normalized).not.toHaveProperty("approvedKeyboards");
    expect(normalized).not.toHaveProperty("exemptedAppPackages");
  });

  it("removes export-only iOS BYOD fields before create", () => {
    const normalized = normalizeAppProtectionPolicyForCreate(
      iosByodTemplate as AppProtectionPolicy
    );

    expect(normalized.displayName).toBe("iOS - Baseline - BYOD - App Protection");
    expect(normalized.description).toBe(HYDRATION_MARKER);
    expect(normalized.roleScopeTagIds).toEqual(["0"]);
    expect(normalized.appGroupType).toBe("allMicrosoftApps");
    expect(normalized.managedUniversalLinks).toBeDefined();
    expect(normalized.exemptedUniversalLinks).toBeDefined();

    expect(normalized).not.toHaveProperty("@odata.context");
    expect(normalized).not.toHaveProperty("id");
    expect(normalized).not.toHaveProperty("version");
    expect(normalized).not.toHaveProperty("isAssigned");
    expect(normalized).not.toHaveProperty("deployedAppCount");
    expect(normalized).not.toHaveProperty("apps");
    expect(normalized).not.toHaveProperty("assignments");
    expect(normalized).not.toHaveProperty("targetedAppManagementLevels");
    expect(normalized).not.toHaveProperty("customBrowserProtocol");
    expect(normalized).not.toHaveProperty("customDialerAppProtocol");
  });

  it("posts the normalized Android payload", async () => {
    const postNoRetry = vi.fn().mockResolvedValue({ id: "android-policy-id" });
    const client = { postNoRetry } as unknown as GraphClient;

    await createAndroidAppProtectionPolicy(
      client,
      androidByodTemplate as AppProtectionPolicy
    );

    expect(postNoRetry).toHaveBeenCalledWith(
      "/deviceAppManagement/androidManagedAppProtections",
      expect.not.objectContaining({
        apps: expect.anything(),
        isAssigned: expect.anything(),
        minimumRequiredPatchVersion: expect.anything(),
      })
    );
  });

  it("posts the normalized iOS payload", async () => {
    const postNoRetry = vi.fn().mockResolvedValue({ id: "ios-policy-id" });
    const client = { postNoRetry } as unknown as GraphClient;

    await createiOSAppProtectionPolicy(client, iosByodTemplate as AppProtectionPolicy);

    expect(postNoRetry).toHaveBeenCalledWith(
      "/deviceAppManagement/iosManagedAppProtections",
      expect.not.objectContaining({
        apps: expect.anything(),
        isAssigned: expect.anything(),
        customBrowserProtocol: expect.anything(),
      })
    );
  });

  it("recovers Android create when POST errors after the policy is created", async () => {
    const postNoRetry = vi.fn().mockRejectedValue(new Error("[503] Service unavailable"));
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "recovered-android-id",
          displayName: "Android - Baseline - BYOD - App Protection",
          description: HYDRATION_MARKER,
        },
      ]);
    const client = { postNoRetry, getCollection } as unknown as GraphClient;

    const created = await createAndroidAppProtectionPolicy(
      client,
      androidByodTemplate as AppProtectionPolicy
    );

    expect(created.id).toBe("recovered-android-id");
    expect(getCollection).toHaveBeenCalledTimes(2);
  });
});
