export interface UserComboboxQuery {
  search: string;
  page: number;
  revision: number;
}

export function handleUserComboboxSearchKeyDown(event: {
  key: string;
  nativeEvent: { isComposing: boolean };
  preventDefault: () => void;
  stopPropagation: () => void;
}) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  // Search is not an instruction to submit the containing task/proposal form.
  event.preventDefault();
  event.stopPropagation();
}

export function userComboboxQueryReducer(
  current: UserComboboxQuery,
  action:
    | { type: "search"; value: string }
    | { type: "page"; value: number }
    | { type: "retry" },
): UserComboboxQuery {
  if (action.type === "search")
    return { ...current, search: action.value, page: 1 };
  if (action.type === "retry")
    return { ...current, revision: current.revision + 1 };
  if (!Number.isSafeInteger(action.value) || action.value < 1) return current;
  return { ...current, page: action.value };
}
