interface ElectionWindow {
  electionDate: string;
  votingStartDate: string;
  votingEndDate: string;
}

/** Keep the default single-day window linked while a native date input is edited. */
export function updateElectionDate<T extends ElectionWindow>(form: T, value: string): T {
  return {
    ...form,
    electionDate: value,
    votingStartDate: !form.votingStartDate || form.votingStartDate === form.electionDate
      ? value : form.votingStartDate,
    votingEndDate: !form.votingEndDate || form.votingEndDate === form.electionDate
      ? value : form.votingEndDate,
  };
}
