import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  briefingAlertCopy,
  canOpenBriefingLink,
  orderBriefingAlerts,
  type BriefingAttention,
} from "./command-center-presentation";

// Run the page's actual priority decision, without mounting Next or reproducing
// the permission condition in the test harness.
const executiveSource = ts.createSourceFile(
  "page.tsx",
  readFileSync(join(__dirname, "../app/dashboard/executive/page.tsx"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const profilePriority = executiveSource.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) &&
    node.name?.text === "shouldPrioritizeProfileSetup",
);
if (!profilePriority) throw new Error("Missing executive priority decision");
const shouldPrioritizeProfileSetup = runInNewContext(
  `${
    ts.transpileModule(profilePriority.getText(executiveSource), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    }).outputText
  }\nshouldPrioritizeProfileSetup`,
) as (
  role: string | undefined,
  stage: string | null | undefined,
  visibleHrefs: string[],
  alerts: BriefingAttention[],
) => boolean;

test("perfil pendiente sólo es primer paso para ADMIN con dato null explícito y ruta autorizada", () => {
  const hrefs = ["/dashboard/operation-profile"];
  expect(shouldPrioritizeProfileSetup("ADMIN", null, hrefs, [])).toBe(true);
  for (const stage of [undefined, "EXPLORATION", "CAMPAIGN"]) {
    expect(shouldPrioritizeProfileSetup("ADMIN", stage, hrefs, [])).toBe(false);
  }
  for (const role of [undefined, "CAMPAIGN_MANAGER", "AUDITOR", "VOLUNTEER"]) {
    expect(shouldPrioritizeProfileSetup(role, null, hrefs, [])).toBe(false);
  }
  expect(shouldPrioritizeProfileSetup("ADMIN", null, [], [])).toBe(false);
});

test("una alerta crítica conserva prioridad aunque falte perfil; una atención no bloquea configurarlo", () => {
  const alert: BriefingAttention = {
    code: "ELECTORAL_CALENDAR_NOT_ACTIVE",
    severity: "attention",
    title: "Calendario",
    detail: "Sin versión activa",
    href: "/dashboard/electoral-calendar",
  };
  const hrefs = ["/dashboard/operation-profile"];
  expect(shouldPrioritizeProfileSetup("ADMIN", null, hrefs, [alert])).toBe(
    true,
  );
  const critical = { ...alert, severity: "critical" as const };
  expect(
    shouldPrioritizeProfileSetup("ADMIN", null, hrefs, [alert, critical]),
  ).toBe(false);
  expect(alert.severity).toBe("attention");
  expect(critical.severity).toBe("critical");
});

test("critical attention comes first without dropping alerts or changing their server severity", () => {
  const alerts: BriefingAttention[] = [
    {
      code: "setup",
      severity: "attention",
      title: "Setup",
      detail: "",
      href: "/dashboard/team",
    },
    {
      code: "healthy",
      severity: "ok",
      title: "Healthy",
      detail: "",
      href: "/dashboard/tasks",
    },
    {
      code: "overdue",
      severity: "critical",
      title: "Overdue",
      detail: "",
      href: "/dashboard/tasks",
    },
    {
      code: "later",
      severity: "attention",
      title: "Later",
      detail: "",
      href: "/dashboard/events",
    },
  ];
  expect(orderBriefingAlerts(alerts).map((a) => a.code)).toEqual([
    "overdue",
    "setup",
    "later",
    "healthy",
  ]);
  expect(alerts.map((a) => a.code)).toEqual([
    "setup",
    "healthy",
    "overdue",
    "later",
  ]);
  expect(orderBriefingAlerts(alerts)[0]).toBe(alerts[2]);
});

test("shortcuts cannot bypass hidden roles, stages or route boundaries", () => {
  const visible = ["/dashboard/tasks", "/dashboard/events"];
  expect(canOpenBriefingLink("/dashboard/tasks?entityId=qa", visible)).toBe(
    true,
  );
  expect(canOpenBriefingLink("/dashboard/tasks/qa", visible)).toBe(true);
  for (const href of [
    "/dashboard/team",
    "/dashboard/war-room",
    "/dashboard/tasks-private",
    "https://other.test/dashboard/tasks",
    "javascript:alert(1)",
    "//other.test/dashboard/tasks",
    "/dashboard/tasks/../team",
    "/dashboard/tasks/%2e%2e/team",
    "/dashboard/tasks\\..\\team",
  ]) {
    expect(canOpenBriefingLink(href, visible)).toBe(false);
  }
});

test("unknown alert copy stays intact; known calendar copy does not claim active dates", () => {
  const base: BriefingAttention = {
    code: "NEW_SERVER_ALERT",
    severity: "attention",
    title: "Server title",
    detail: "Server detail",
    href: "/dashboard/events",
  };
  expect(briefingAlertCopy(base)).toEqual({
    title: base.title,
    detail: base.detail,
  });
  expect(
    briefingAlertCopy({ ...base, code: "ELECTORAL_CALENDAR_NOT_ACTIVE" })
      .detail,
  ).toContain("No hay una versión activa");
});
