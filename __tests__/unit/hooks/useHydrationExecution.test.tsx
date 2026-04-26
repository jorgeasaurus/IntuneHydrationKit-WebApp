import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchProgress, HydrationSummary, HydrationTask, WizardState } from "@/types/hydration";
import type { AppSettings } from "@/types/hydration";
import type { PrerequisiteCheckResult } from "@/types/prerequisites";
import type { ActivityMessage, ExecutionContext } from "@/lib/hydration/types";

const {
  mockUseWizardState,
  mockUseSettings,
  mockCreateGraphClient,
  mockBuildTaskQueueAsync,
  mockExecuteTasks,
  mockCreateSummary,
  mockGetBatchConfig,
  mockIsBatchableCategory,
} = vi.hoisted(() => ({
  mockUseWizardState: vi.fn(),
  mockUseSettings: vi.fn(),
  mockCreateGraphClient: vi.fn(),
  mockBuildTaskQueueAsync: vi.fn(),
  mockExecuteTasks: vi.fn(),
  mockCreateSummary: vi.fn(),
  mockGetBatchConfig: vi.fn(),
  mockIsBatchableCategory: vi.fn(),
}));

vi.mock("@/hooks/useWizardState", () => ({
  useWizardState: mockUseWizardState,
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: mockUseSettings,
}));

vi.mock("@/lib/graph/client", () => ({
  createGraphClient: mockCreateGraphClient,
}));

vi.mock("@/lib/hydration/engine", () => ({
  buildTaskQueueAsync: mockBuildTaskQueueAsync,
  executeTasks: mockExecuteTasks,
}));

vi.mock("@/lib/hydration/reporter", () => ({
  createSummary: mockCreateSummary,
}));

vi.mock("@/lib/config/batchConfig", () => ({
  getBatchConfig: mockGetBatchConfig,
}));

vi.mock("@/lib/hydration/batchExecutor", () => ({
  isBatchableCategory: mockIsBatchableCategory,
}));

import { useHydrationExecution } from "@/hooks/useHydrationExecution";

function createPrerequisiteResult(): PrerequisiteCheckResult {
  return {
    organization: null,
    licenses: {
      hasIntuneLicense: true,
      hasConditionalAccessLicense: false,
      hasPremiumP2License: false,
      hasWindowsDriverUpdateLicense: true,
      intuneServicePlans: [],
      conditionalAccessServicePlans: [],
      premiumP2ServicePlans: [],
      windowsDriverUpdateServicePlans: [],
      allSkus: [],
    },
    permissions: null,
    isValid: true,
    warnings: [],
    errors: [],
    timestamp: new Date("2024-01-01T00:00:00.000Z"),
  };
}

function createWizardState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    currentStep: 5,
    tenantConfig: {
      tenantId: "tenant-123",
      tenantName: "Contoso",
      cloudEnvironment: "global",
    },
    operationMode: "create",
    isPreview: false,
    selectedTargets: ["groups", "enrollment"],
    selectedCISCategories: [],
    confirmed: true,
    prerequisiteResult: createPrerequisiteResult(),
    ...overrides,
  };
}

function createTask(
  id: string,
  category: HydrationTask["category"],
  itemName: string
): HydrationTask {
  return {
    id,
    category,
    itemName,
    operation: "create",
    status: "pending",
  };
}

function createSummary(): HydrationSummary {
  const startTime = new Date("2024-01-01T00:00:00.000Z");
  const endTime = new Date("2024-01-01T00:00:05.000Z");

  return {
    tenantId: "tenant-123",
    operationMode: "create",
    startTime,
    endTime,
    duration: endTime.getTime() - startTime.getTime(),
    stats: {
      total: 2,
      created: 1,
      deleted: 0,
      skipped: 0,
      failed: 0,
    },
    categoryBreakdown: {
      groups: {
        total: 1,
        success: 1,
        skipped: 0,
        failed: 0,
      },
    },
    errors: [],
    warnings: [],
    batchStats: {
      batchingEnabled: true,
      batchSize: 5,
      batchRequestCount: 1,
      batchedTaskCount: 1,
      sequentialTaskCount: 1,
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("useHydrationExecution", () => {
  let wizardState: WizardState;
  let settings: AppSettings;
  const mockClient = {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    getCollection: vi.fn(),
    patch: vi.fn(),
    batch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    wizardState = createWizardState();
    settings = {
      stopOnFirstError: false,
      theme: "system",
    };

    mockUseWizardState.mockImplementation(() => ({ state: wizardState }));
    mockUseSettings.mockImplementation(() => ({ settings }));
    mockCreateGraphClient.mockReturnValue(mockClient);
    mockGetBatchConfig.mockReturnValue({
      enableBatching: true,
      defaultBatchSize: 5,
      maxBatchSize: 20,
      delayBetweenBatches: 0,
    });
    mockIsBatchableCategory.mockImplementation((category: string) => category === "groups");
    mockCreateSummary.mockReturnValue(createSummary());
  });

  it("rejects invalid wizard state before starting execution", async () => {
    wizardState = createWizardState({
      tenantConfig: undefined,
      operationMode: undefined,
      selectedTargets: [],
    });

    const { result } = renderHook(() => useHydrationExecution());

    await expect(result.current.startExecution()).rejects.toThrow(
      "Invalid wizard state. Please complete the wizard first."
    );

    expect(mockBuildTaskQueueAsync).not.toHaveBeenCalled();
    expect(mockExecuteTasks).not.toHaveBeenCalled();
  });

  it("builds the queue, executes tasks, and creates a summary with batch stats", async () => {
    const tasks = [
      createTask("group-1", "groups", "All Windows Devices"),
      createTask("enrollment-1", "enrollment", "Windows Autopilot"),
    ];
    const progress: BatchProgress = {
      isActive: true,
      currentBatch: 1,
      totalBatches: 1,
      itemsInBatch: 1,
      apiVersion: "v1.0",
      batchStartTime: new Date("2024-01-01T00:00:02.000Z"),
    };

    mockBuildTaskQueueAsync.mockImplementation(
      async (
        _selectedTargets: WizardState["selectedTargets"],
        _operationMode: WizardState["operationMode"],
        options: { onProgress?: (message: string, type?: ActivityMessage["type"]) => void }
      ) => {
        options.onProgress?.("Loaded templates");
        return tasks;
      }
    );
    mockExecuteTasks.mockImplementation(async (queuedTasks: HydrationTask[], context: ExecutionContext) => {
      context.onBatchProgress?.(progress);
      context.onStatusUpdate?.({
        id: "status-1",
        timestamp: new Date("2024-01-01T00:00:03.000Z"),
        message: "Executing groups batch",
        type: "info",
        category: "groups",
      });

      Object.assign(queuedTasks[0], {
        status: "success",
        startTime: new Date("2024-01-01T00:00:03.000Z"),
        endTime: new Date("2024-01-01T00:00:04.000Z"),
      });
      context.onTaskStart?.({ ...queuedTasks[0], status: "running" });
      context.onTaskComplete?.({ ...queuedTasks[0] });
    });

    const { result } = renderHook(() => useHydrationExecution());

    await act(async () => {
      await result.current.startExecution();
    });

    expect(mockCreateGraphClient).toHaveBeenCalledWith("global");
    expect(mockBuildTaskQueueAsync).toHaveBeenCalledWith(
      ["groups", "enrollment"],
      "create",
      expect.objectContaining({
        selectedCISCategories: [],
        baselineSelection: undefined,
        categorySelections: undefined,
        onProgress: expect.any(Function),
      })
    );
    expect(mockExecuteTasks).toHaveBeenCalledWith(
      tasks,
      expect.objectContaining({
        client: mockClient,
        operationMode: "create",
        isPreview: false,
        stopOnFirstError: false,
        hasConditionalAccessLicense: false,
        hasPremiumP2License: false,
        hasWindowsDriverUpdateLicense: true,
        shouldCancel: expect.any(Function),
        shouldPause: expect.any(Function),
      })
    );
    expect(mockCreateSummary).toHaveBeenCalledWith(
      "tenant-123",
      "create",
      expect.any(Date),
      expect.any(Date),
      tasks,
      {
        batchingEnabled: true,
        batchSize: 5,
        batchRequestCount: 1,
        batchedTaskCount: 1,
        sequentialTaskCount: 1,
      }
    );

    expect(result.current.tasks).toEqual([
      expect.objectContaining({ id: "group-1", status: "success" }),
      expect.objectContaining({ id: "enrollment-1", status: "pending" }),
    ]);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isCompleted).toBe(true);
    expect(result.current.isBuildingQueue).toBe(false);
    expect(result.current.summary).toEqual(createSummary());
    expect(result.current.batchProgress).toEqual({
      ...progress,
      isActive: false,
    });
    expect(result.current.activityLog.map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        "Building task queue...",
        "Loaded templates",
        "Task queue ready: 2 tasks queued",
        "Executing groups batch",
      ])
    );
  });

  it("ignores duplicate start requests while execution is already locked", async () => {
    const queuedTasks = [createTask("group-1", "groups", "All Windows Devices")];
    const buildQueue = createDeferred<HydrationTask[]>();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mockBuildTaskQueueAsync.mockReturnValue(buildQueue.promise);
    mockExecuteTasks.mockResolvedValue(undefined);

    const { result } = renderHook(() => useHydrationExecution());

    let firstRun!: Promise<void>;
    let secondRun!: Promise<void>;

    await act(async () => {
      firstRun = result.current.startExecution();
      secondRun = result.current.startExecution();
    });

    await waitFor(() => {
      expect(mockBuildTaskQueueAsync).toHaveBeenCalledTimes(1);
    });

    buildQueue.resolve(queuedTasks);

    await act(async () => {
      await Promise.all([firstRun, secondRun]);
    });

    expect(logSpy).toHaveBeenCalledWith(
      "[Execution Hook] Execution already in progress, ignoring duplicate call"
    );
    expect(mockExecuteTasks).toHaveBeenCalledTimes(1);
  });

  it("marks execution complete and rethrows task errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("Execution exploded");

    mockBuildTaskQueueAsync.mockResolvedValue([
      createTask("group-1", "groups", "All Windows Devices"),
    ]);
    mockExecuteTasks.mockRejectedValue(failure);

    const { result } = renderHook(() => useHydrationExecution());

    await act(async () => {
      await expect(result.current.startExecution()).rejects.toThrow("Execution exploded");
    });

    await waitFor(() => {
      expect(result.current.isCompleted).toBe(true);
    });

    expect(errorSpy).toHaveBeenCalledWith("Execution failed:", failure);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isCompleted).toBe(true);
    expect(result.current.endTime).toBeInstanceOf(Date);
    expect(result.current.summary).toBeNull();
  });

  it("supports pause, resume, cancel, and reset controls", () => {
    const { result } = renderHook(() => useHydrationExecution());

    act(() => {
      result.current.pause();
    });
    expect(result.current.isPaused).toBe(true);

    act(() => {
      result.current.resume();
    });
    expect(result.current.isPaused).toBe(false);

    act(() => {
      result.current.cancel();
    });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.isCompleted).toBe(true);
    expect(result.current.endTime).toBeInstanceOf(Date);
    expect(result.current.activityLog.map(({ message }) => message)).toEqual([
      "Pause requested. Execution will stop after the current in-flight work completes.",
      "Execution resumed.",
      "Cancellation requested. Remaining work will be skipped.",
    ]);

    act(() => {
      result.current.reset();
    });
    expect(result.current.tasks).toEqual([]);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.startTime).toBeNull();
    expect(result.current.endTime).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.batchProgress).toBeNull();
    expect(result.current.activityLog).toEqual([]);
  });
});
