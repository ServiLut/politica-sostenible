import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { buildContentSecurityPolicy, config, proxy } from "./proxy";

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

  test("lets a non-legacy route continue through Next with a nonce", () => {
    const response = proxy(
      new NextRequest(
        "https://politica-sostenible.example/dashboard/unknown-module",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("Content-Security-Policy")).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/u,
    );
  });
});

test.describe("strict content security policy", () => {
  test("removes script unsafe-inline while retaining only calculated inline styles", () => {
    const policy = buildContentSecurityPolicy("fixed-test-nonce", false);

    expect(policy).toContain(
      "script-src 'self' 'nonce-fixed-test-nonce' 'strict-dynamic'",
    );
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/u);
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  test("keeps unsafe-eval limited to development", () => {
    expect(buildContentSecurityPolicy("fixed-test-nonce", true)).toMatch(
      /script-src[^;]*'unsafe-eval'/u,
    );
  });

  test("covers rendered routes while excluding API and immutable assets", () => {
    expect(config.matcher).toHaveLength(1);
    expect(config.matcher[0]).toMatchObject({
      source: expect.stringContaining("(?!api|_next/static|_next/image"),
    });
  });
});
