import { expect, test } from "@playwright/test";
import { canEditWitnessPlanning } from "./witness-planning-presentation";

test("planificación respeta la consulta autoritativa y no ofrece guardar mientras falta alistamiento", () => {
  const state = { stage: "CAMPAIGN", context: "REAL", isPlanner: true, windowsReadOnly: false, assignmentsReadOnly: false } as const;
  expect(canEditWitnessPlanning(state)).toBe(true);
  expect(canEditWitnessPlanning({ ...state, stage: undefined })).toBe(false);
  expect(canEditWitnessPlanning({ ...state, isPlanner: false })).toBe(false);
  expect(canEditWitnessPlanning({ ...state, windowsReadOnly: undefined })).toBe(false);
  expect(canEditWitnessPlanning({ ...state, assignmentsReadOnly: true })).toBe(false);
  for (const stage of ["EXPLORATION", "SIGNATURE_COLLECTION", "POST_ELECTION", "CLOSED"] as const) {
    expect(canEditWitnessPlanning({ ...state, stage, windowsReadOnly: true, assignmentsReadOnly: true })).toBe(false);
  }
});

test("el contexto de simulacro no habilita cambios en precampaña ni jornada real", () => {
  const state = { context: "SIMULATION", isPlanner: true, windowsReadOnly: false, assignmentsReadOnly: false } as const;
  for (const stage of ["PRE_CAMPAIGN", "ELECTION_DAY"] as const) expect(canEditWitnessPlanning({ ...state, stage })).toBe(false);
  for (const stage of ["CAMPAIGN", "ELECTION_PREPARATION", "SIMULATION"] as const) expect(canEditWitnessPlanning({ ...state, stage })).toBe(true);
});
