import { describe, expect, it } from "vitest";

import { GET } from "@/app/auth/redirect/route";

describe("GET /auth/redirect", () => {
  it("returns a blank HTML page that is not cached", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.text();
    expect(body.startsWith("<!doctype html>")).toBe(true);
    expect(body).toContain("<title>");
    expect(body).not.toMatch(/<script/i);
    expect(body).not.toMatch(/<link/i);
  });

  it("does not read the request, so the query string and hash cannot reach the body", () => {
    expect(GET.length).toBe(0);
  });
});
