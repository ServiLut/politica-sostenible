import { expect, test } from "@playwright/test";
import {
  briefingAlertCopy,
  canOpenBriefingLink,
  orderBriefingAlerts,
  type BriefingAttention,
} from "./command-center-presentation";

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
