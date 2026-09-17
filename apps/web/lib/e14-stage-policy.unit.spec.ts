import { expect, test } from "@playwright/test";
import type { PoliticalOperationStage } from "@/types/saas-schema";
import {
  canConfigurePollingPlaces,
  canPersistE14,
} from "./e14-stage-policy";

const ALL_STAGES: PoliticalOperationStage[] = [
  "EXPLORATION",
  "PRE_CAMPAIGN",
  "SIGNATURE_COLLECTION",
  "CAMPAIGN",
  "ELECTION_PREPARATION",
  "SIMULATION",
  "ELECTION_DAY",
  "POST_ELECTION",
  "CLOSED",
];

test("permite persistir E-14 aislados en simulacion y operacion real", () => {
  for (const stage of ALL_STAGES) {
    expect(canPersistE14(stage), stage).toBe(
      stage === "SIMULATION" ||
        stage === "ELECTION_DAY" ||
        stage === "POST_ELECTION",
    );
  }
  expect(canPersistE14(null)).toBe(false);
  expect(canPersistE14(undefined)).toBe(false);
});

test("la simulacion permite preparar mesas y persistir solo el ensayo", () => {
  expect(canConfigurePollingPlaces("ELECTION_PREPARATION")).toBe(true);
  expect(canConfigurePollingPlaces("SIMULATION")).toBe(true);
  expect(canPersistE14("SIMULATION")).toBe(true);
  expect(canConfigurePollingPlaces("ELECTION_DAY")).toBe(false);
  expect(canConfigurePollingPlaces("POST_ELECTION")).toBe(false);
});
