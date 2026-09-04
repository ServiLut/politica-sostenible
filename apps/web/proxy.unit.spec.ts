import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

test.describe("legacy dashboard routes", () => {
  test("redirects the historical security log URL to the real audit module", () => {
    const response = proxy(
      new NextRequest(
        "https://politica-sostenible.example/dashboard/security/logs",
      ),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://politica-sostenible.example/dashboard/audit",
    );
  });

  test("does not turn an unknown dashboard URL into a legacy redirect", () => {
    const response = proxy(
      new NextRequest(
        "https://politica-sostenible.example/dashboard/unknown-module",
      ),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });
});
