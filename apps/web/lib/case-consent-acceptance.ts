import {
  getConsentNoticePresentationKey,
  type ConsentNotice,
} from "./consent-notices-api";

interface CaseConsentPresentation {
  caseId: string;
  reloadVersion: number;
  notice: Pick<ConsentNotice, "id" | "version"> | null | undefined;
}

export function getCaseConsentAcceptanceKey({
  caseId,
  reloadVersion,
  notice,
}: CaseConsentPresentation): string | null {
  const noticeKey = getConsentNoticePresentationKey(notice);
  return noticeKey ? JSON.stringify([caseId, reloadVersion, noticeKey]) : null;
}

export function hasCurrentCaseConsentAcceptance({
  accepted,
  acceptedKey,
  ...presentation
}: CaseConsentPresentation & {
  accepted: boolean;
  acceptedKey: string | null;
}): boolean {
  const currentKey = getCaseConsentAcceptanceKey(presentation);
  return accepted && currentKey !== null && acceptedKey === currentKey;
}
