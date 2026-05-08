import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogLevel } from "@azure/msal-browser";

const mocks = vi.hoisted(() => {
  const initialize = vi.fn().mockResolvedValue(undefined);
  const constructorSpy = vi.fn();

  class PublicClientApplication {
    initialize = initialize;

    constructor(config: unknown) {
      constructorSpy(config);
    }
  }

  return {
    initialize,
    constructorSpy,
    PublicClientApplication,
  };
});

vi.mock("@azure/msal-browser", () => ({
  LogLevel: {
    Error: "error",
    Info: "info",
    Verbose: "verbose",
    Warning: "warning",
  },
  PublicClientApplication: mocks.PublicClientApplication,
}));

async function importModule() {
  return import("@/lib/auth/msalConfig");
}

describe("msalConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.initialize.mockReset().mockResolvedValue(undefined);
    mocks.constructorSpy.mockClear();
  });

  it("returns the correct graph endpoints and authority URLs for supported clouds", async () => {
    const { getAuthorityUrl, getGraphEndpoint } = await importModule();

    expect(getGraphEndpoint()).toBe("https://graph.microsoft.com");
    expect(getGraphEndpoint("usgov")).toBe("https://graph.microsoft.us");
    expect(getGraphEndpoint("usgovdod")).toBe("https://dod-graph.microsoft.us");
    expect(getGraphEndpoint("germany")).toBe("https://graph.microsoft.de");
    expect(getGraphEndpoint("china")).toBe("https://microsoftgraph.chinacloudapi.cn");

    expect(getAuthorityUrl()).toBe("https://login.microsoftonline.com/common");
    expect(getAuthorityUrl("germany", "tenant-id")).toBe(
      "https://login.microsoftonline.de/tenant-id"
    );
  });

  it("creates the MSAL instance with secure defaults and required scopes", async () => {
    const module = await importModule();

    expect(mocks.constructorSpy).toHaveBeenCalledTimes(1);
    expect(module.loginRequest.scopes).toEqual(module.REQUIRED_SCOPES);
    expect(module.msalConfig.cache).toEqual({
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false,
    });
    expect(module.msalConfig.auth.authority).toBe("https://login.microsoftonline.com/common");
    expect(module.msalConfig.auth.redirectUri).toBe("http://localhost:3000");
    expect(module.msalConfig.auth.postLogoutRedirectUri).toBe("http://localhost:3000");
  });

  it("routes logger messages to the expected console method and skips PII logs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const module = await importModule();
    const logger = module.msalConfig.system?.loggerOptions?.loggerCallback;

    logger?.(LogLevel.Error, "error message", false);
    logger?.(LogLevel.Info, "info message", false);
    logger?.(LogLevel.Verbose, "debug message", false);
    logger?.(LogLevel.Warning, "warn message", false);
    logger?.(LogLevel.Error, "pii message", true);

    expect(errorSpy).toHaveBeenCalledWith("error message");
    expect(infoSpy).toHaveBeenCalledWith("info message");
    expect(debugSpy).toHaveBeenCalledWith("debug message");
    expect(warnSpy).toHaveBeenCalledWith("warn message");
    expect(errorSpy).not.toHaveBeenCalledWith("pii message");
  });

  it("initializes MSAL only once and reuses the in-flight promise", async () => {
    let resolveInitialize: (() => void) | undefined;
    const initializePromise = new Promise<void>((resolve) => {
      resolveInitialize = resolve;
    });
    mocks.initialize.mockReturnValueOnce(initializePromise);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const module = await importModule();

    const firstCall = module.initializeMsal();
    const secondCall = module.initializeMsal();

    expect(mocks.initialize).toHaveBeenCalledTimes(1);

    resolveInitialize?.();
    await Promise.all([firstCall, secondCall]);

    expect(logSpy).toHaveBeenCalledWith("[MSAL] Instance initialized successfully");

    await module.initializeMsal();
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
  });
});
