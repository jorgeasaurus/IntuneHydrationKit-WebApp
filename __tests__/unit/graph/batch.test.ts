import { describe, expect, it } from "vitest";

import {
  extractBatchError,
  getRetryAfterFromBatchResponse,
  isBatchResponseConflict,
  isBatchResponseOutcomeUnknown,
  isBatchResponseRetryable,
  isBatchResponseSuccess,
} from "@/lib/graph/batch";

describe("batch graph utilities", () => {
  it("classifies response statuses", () => {
    expect(isBatchResponseSuccess(200)).toBe(true);
    expect(isBatchResponseSuccess(299)).toBe(true);
    expect(isBatchResponseSuccess(300)).toBe(false);

    // Only responses that prove "not processed" can be sent again.
    expect(isBatchResponseRetryable({ status: 429 })).toBe(true);
    expect(isBatchResponseRetryable({ status: 503, headers: { "Retry-After": "2" } })).toBe(true);
    expect(isBatchResponseRetryable({ status: 503 })).toBe(false);
    expect(isBatchResponseRetryable({ status: 500 })).toBe(false);
    expect(isBatchResponseRetryable({ status: 504 })).toBe(false);
    expect(isBatchResponseRetryable({ status: 400 })).toBe(false);

    expect(isBatchResponseOutcomeUnknown({ status: 500 })).toBe(true);
    expect(isBatchResponseOutcomeUnknown({ status: 503 })).toBe(true);
    expect(isBatchResponseOutcomeUnknown({ status: 599 })).toBe(true);
    expect(isBatchResponseOutcomeUnknown({ status: 503, headers: { "retry-after": "2" } })).toBe(false);
    expect(isBatchResponseOutcomeUnknown({ status: 429 })).toBe(false);
    expect(isBatchResponseOutcomeUnknown({ status: 400 })).toBe(false);

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
      innerMessage: undefined,
    });

    expect(
      extractBatchError({
        id: "graph-inner",
        status: 400,
        body: {
          error: {
            code: "BadRequest",
            message: "The server could not process the request because it is malformed or incorrect.",
            innerError: {
              message: "1101: The tenant must be explicitly authorized to use the private preview feature: AccountRecovery.",
            },
          },
        },
      })
    ).toEqual({
      id: "graph-inner",
      status: 400,
      code: "BadRequest",
      message: "The server could not process the request because it is malformed or incorrect.",
      innerMessage: "1101: The tenant must be explicitly authorized to use the private preview feature: AccountRecovery.",
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
      innerMessage: undefined,
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
      innerMessage: undefined,
    });
  });

  it("parses retry-after values and ignores invalid headers", () => {
    expect(getRetryAfterFromBatchResponse({ "Retry-After": "5" })).toBe(5000);
    expect(getRetryAfterFromBatchResponse({ "retry-after": "7" })).toBe(7000);
    expect(getRetryAfterFromBatchResponse({ "Retry-After": "soon" })).toBeUndefined();
    expect(getRetryAfterFromBatchResponse({ "RETRY-AFTER": "600" })).toBe(60000);
    const inTenSeconds = new Date(Date.now() + 10000).toUTCString();
    const fromDate = getRetryAfterFromBatchResponse({ "Retry-After": inTenSeconds });
    expect(fromDate).toBeGreaterThan(8000);
    expect(fromDate).toBeLessThanOrEqual(10000);
    expect(getRetryAfterFromBatchResponse()).toBeUndefined();
  });

});
