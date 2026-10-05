import { expect, test } from "@playwright/test";
import { updateElectionDate } from "./operation-dates";

test("la escritura segmentada del año no deja una ventana en el año0002", () => {
  let form = { electionDate: "", votingStartDate: "", votingEndDate: "", notes: "preservado" };
  for (const year of ["0002", "0020", "0202", "2026"]) {
    form = updateElectionDate(form, `${year}-12-20`);
  }
  expect(form).toEqual({ electionDate: "2026-12-20", votingStartDate: "2026-12-20", votingEndDate: "2026-12-20", notes: "preservado" });
});

test("conserva límites personalizados al modificar la fecha principal", () => {
  const form = { electionDate: "2026-12-20", votingStartDate: "2026-12-18", votingEndDate: "2026-12-22" };
  expect(updateElectionDate(form, "2026-12-21")).toEqual({ ...form, electionDate: "2026-12-21" });
  expect(form.electionDate).toBe("2026-12-20");
  expect(updateElectionDate({ ...form, votingStartDate: form.electionDate }, "2026-12-21").votingEndDate).toBe("2026-12-22");
});

test("limpiar y volver a elegir fecha sincroniza sólo la ventana vinculada", () => {
  const form = { electionDate: "2026-12-20", votingStartDate: "2026-12-20", votingEndDate: "2026-12-20" };
  const empty = updateElectionDate(form, "");
  expect(empty).toEqual({ electionDate: "", votingStartDate: "", votingEndDate: "" });
  expect(updateElectionDate(empty, "2027-01-10")).toEqual({ electionDate: "2027-01-10", votingStartDate: "2027-01-10", votingEndDate: "2027-01-10" });
});
