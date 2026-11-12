import { describe, expect, it } from "vitest";

import { findBaselineTemplateForTask } from "@/lib/templates/baselineLookup";
import type { BaselinePolicy } from "@/lib/templates/loader";

function policy(name: string, path: string): BaselinePolicy {
  return { name, displayName: name, _oibFilePath: path, _oibPlatform: "WINDOWS", _oibPolicyType: "SettingsCatalog" };
}

describe("findBaselineTemplateForTask", () => {
  const templates = [policy("[IHD] Shared", "WINDOWS/a.json"), policy("[IHD] Shared", "WINDOWS/b.json")];

  it("resolves by file path ahead of an earlier template with the same name", () => {
    expect(findBaselineTemplateForTask(templates, { itemName: "[IHD] Shared", templatePath: "WINDOWS/b.json" })).toBe(
      templates[1],
    );
  });

  it("does not fall back to a same-named template when the task's path is missing", () => {
    expect(
      findBaselineTemplateForTask(templates, { itemName: "[IHD] Shared", templatePath: "WINDOWS/missing.json" }),
    ).toBeUndefined();
  });

  it("falls back to the name for tasks without a path", () => {
    expect(findBaselineTemplateForTask(templates, { itemName: "[IHD] Shared" })).toBe(templates[0]);
    const displayNameOnly = { ...policy("ignored", "WINDOWS/c.json"), name: undefined, displayName: "[IHD] Display" };
    expect(findBaselineTemplateForTask([displayNameOnly], { itemName: "[IHD] Display" })).toBe(displayNameOnly);
  });
});
