import { describe, expect, it } from "vitest";

import {
  API_VERSION_MAP,
  chunkArray,
  extractBatchError,
  getRetryAfterFromBatchResponse,
  groupRequestsByVersion,
  isBatchResponseConflict,
  isBatchResponseRetryable,
  isBatchResponseSuccess,
  processBatchResponses,
} from "@/lib/graph/batch";

describe("batch graph utilities", () => {
  it("classifies response statuses and exposes the API version map", () => {
    expect(API_VERSION_MAP.groups).toBe("v1.0");
    expect(API_VERSION_MAP.conditionalAccess).toBe("v1.0");
    expect(API_VERSION_MAP.filters).toBe("beta");

    expect(isBatchResponseSuccess(200)).toBe(true);
    expect(isBatchResponseSuccess(299)).toBe(true);
    expect(isBatchResponseSuccess(300)).toBe(false);

    expect(isBatchResponseRetryable(429)).toBe(true);
    expect(isBatchResponseRetryable(500)).toBe(true);
    expect(isBatchResponseRetryable(599)).toBe(true);
    expect(isBatchResponseRetryable(400)).toBe(false);

    expect(isBatchResponseConflict(409)).toBe(true);
    expect(isBatchResponseConflict(404)).toBe(false);
  });

  it("extracts Graph, Intune, and fallback batch errors", () => {
    expect(
      extractBatchError({
        id: "graph",
        status: 403,
        body: {
          error: {
            code: "Forbidden",
            message: "Access denied",
          },
        },
      })
    ).toEqual({
      id: "graph",
      status: 403,
      code: "Forbidden",
      message: "Access denied",
    });

    expect(
      extractBatchError({
        id: "intune",
        status: 400,
        body: {
          Message: "Template validation failed",
        },
      })
    ).toEqual({
      id: "intune",
      status: 400,
      code: undefined,
      message: "Template validation failed",
    });

    expect(
      extractBatchError({
        id: "fallback",
        status: 502,
      })
    ).toEqual({
      id: "fallback",
      status: 502,
      code: undefined,
      message: "HTTP 502",
    });
  });

  it("parses retry-after values and ignores invalid headers", () => {
    expect(getRetryAfterFromBatchResponse({ "Retry-After": "5" })).toBe(5000);
    expect(getRetryAfterFromBatchResponse({ "retry-after": "7" })).toBe(7000);
    expect(getRetryAfterFromBatchResponse({ "Retry-After": "soon" })).toBeUndefined();
    expect(getRetryAfterFromBatchResponse()).toBeUndefined();
  });

  it("separates successful, failed, and retryable batch responses", () => {
    const result = processBatchResponses({
      responses: [
        { id: "success", status: 201 },
        { id: "conflict", status: 409 },
        { id: "retry-later", status: 429 },
        { id: "server", status: 503 },
        { id: "failed", status: 400 },
      ],
    });

    expect(result.successful.map(({ id }) => id)).toEqual(["success", "conflict"]);
    expect(result.retryable.map(({ id }) => id)).toEqual(["retry-later", "server"]);
    expect(result.failed.map(({ id }) => id)).toEqual(["failed"]);
  });

  it("chunks arrays and groups requests by API version", () => {
    expect(chunkArray(["a", "b", "c", "d", "e"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
    expect(chunkArray([], 3)).toEqual([]);

    const grouped = groupRequestsByVersion([
      {
        id: "1",
        method: "GET",
        url: "/groups",
        apiVersion: "v1.0",
      },
      {
        id: "2",
        method: "POST",
        url: "/deviceManagement/assignmentFilters",
        body: { displayName: "Windows" },
        apiVersion: "beta",
      },
      {
        id: "3",
        method: "DELETE",
        url: "/groups/1",
        apiVersion: "v1.0",
      },
    ]);

    expect(grouped.get("v1.0")).toEqual([
      { id: "1", method: "GET", url: "/groups" },
      { id: "3", method: "DELETE", url: "/groups/1" },
    ]);
    expect(grouped.get("beta")).toEqual([
      {
        id: "2",
        method: "POST",
        url: "/deviceManagement/assignmentFilters",
        body: { displayName: "Windows" },
      },
    ]);
  });
});
