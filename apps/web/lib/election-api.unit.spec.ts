import { expect, test } from "@playwright/test";
import {
  hasCompleteWitnessTraceability,
  listWitnessReports,
  validateWitnessReportMesaFilter,
  validateWitnessVoteBreakdown,
  WITNESS_REPORT_MESA_FILTER_ERROR,
  WITNESS_REPORT_VOTE_RANGE_ERROR,
  WITNESS_REPORT_VOTE_TOTAL_ERROR,
} from "./election-api";

const completeTraceability = {
  credentialType: "E15" as const,
  credentialReference: "E15-BOG-001-0001",
  checkedInAt: "2026-08-21T12:00:00.000Z",
  e14FormType: "DELEGADOS" as const,
  candidateVotes: 80,
  blankVotes: 5,
  nullVotes: 3,
  unmarkedVotes: 2,
  totalTableVotes: 180,
  hasWrittenClaim: false,
  reclamationGround: null,
  reclamationDescription: null,
};

test("acepta una mesa vacía o un entero dentro del contrato del DTO", () => {
  expect(validateWitnessReportMesaFilter("  ")).toEqual({ valid: true });
  expect(validateWitnessReportMesaFilter("1")).toEqual({
    valid: true,
    mesa: 1,
  });
  expect(validateWitnessReportMesaFilter("99999")).toEqual({
    valid: true,
    mesa: 99_999,
  });
});

test("rechaza valores fuera de 1..99999 y números que no sean enteros", () => {
  for (const value of ["0", "100000", "1.5", "mesa", "Infinity"]) {
    expect(validateWitnessReportMesaFilter(value)).toEqual({
      valid: false,
      message: WITNESS_REPORT_MESA_FILTER_ERROR,
    });
  }
});

test("la defensa del cliente impide enviar una consulta de mesa inválida", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response();
  };

  try {
    expect(() => listWitnessReports({ mesa: 100_000 })).toThrow(
      WITNESS_REPORT_MESA_FILTER_ERROR,
    );
    expect(fetchCalls).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("acepta un desglose de votos consistente con el total de la mesa", () => {
  expect(
    validateWitnessVoteBreakdown({
      candidateVotes: 80,
      blankVotes: 5,
      nullVotes: 3,
      unmarkedVotes: 2,
      totalTableVotes: 180,
    }),
  ).toEqual({ valid: true });
});

test("rechaza conteos fuera de rango y sumas que exceden el total", () => {
  expect(
    validateWitnessVoteBreakdown({
      candidateVotes: 80,
      blankVotes: -1,
      nullVotes: 3,
      unmarkedVotes: 2,
      totalTableVotes: 180,
    }),
  ).toEqual({ valid: false, message: WITNESS_REPORT_VOTE_RANGE_ERROR });

  expect(
    validateWitnessVoteBreakdown({
      candidateVotes: 80,
      blankVotes: 15,
      nullVotes: 4,
      unmarkedVotes: 2,
      totalTableVotes: 100,
    }),
  ).toEqual({ valid: false, message: WITNESS_REPORT_VOTE_TOTAL_ERROR });
});

test("solo habilita conciliación cuando la trazabilidad está completa", () => {
  const reviewTime = Date.parse("2026-08-21T13:00:00.000Z");
  expect(hasCompleteWitnessTraceability(completeTraceability, reviewTime)).toBe(
    true,
  );
  expect(
    hasCompleteWitnessTraceability(
      {
        ...completeTraceability,
        credentialType: null,
        credentialReference: null,
        checkedInAt: null,
        e14FormType: null,
        blankVotes: null,
        nullVotes: null,
        unmarkedVotes: null,
        hasWrittenClaim: null,
      },
      reviewTime,
    ),
  ).toBe(false);
});

test("impide conciliar una presencia futura o una causal alternativa sin norma", () => {
  const reviewTime = Date.parse("2026-08-21T13:00:00.000Z");
  expect(
    hasCompleteWitnessTraceability(
      {
        ...completeTraceability,
        checkedInAt: "2026-08-21T13:06:00.000Z",
      },
      reviewTime,
    ),
  ).toBe(false);
  expect(
    hasCompleteWitnessTraceability(
      {
        ...completeTraceability,
        hasWrittenClaim: true,
        reclamationGround: "OTHER_STATUTORY_GROUND",
        reclamationDescription:
          "Se registró otra causal sin indicar su fundamento concreto.",
      },
      reviewTime,
    ),
  ).toBe(false);
});
