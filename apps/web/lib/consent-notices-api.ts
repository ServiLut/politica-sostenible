import { apiRequest } from "./api-client";

export type ConsentNoticeMode = "CAMPAIGN" | "PUBLIC_OFFICE";
export type ConsentNoticePurpose =
  | "POLITICAL_COMMUNICATION"
  | "SERVICE_FOLLOW_UP";

export interface ConsentNotice {
  id: string;
  mode: ConsentNoticeMode;
  purpose: ConsentNoticePurpose;
  version: string;
  title: string;
  content: string;
  controllerName: string;
  contactEmail: string;
  privacyPolicyUrl: string | null;
  activatedAt: string;
}

export interface ConsentNoticeContext {
  configured: boolean;
  mode: ConsentNoticeMode;
  purpose: ConsentNoticePurpose;
  notice: ConsentNotice | null;
}

export interface ActivateConsentNoticeInput {
  version: string;
  title: string;
  content: string;
  controllerName: string;
  contactEmail: string;
  privacyPolicyUrl?: string;
}

export function getConsentNoticePresentationKey(
  notice: Pick<ConsentNotice, "id" | "version"> | null | undefined,
): string | null {
  return notice ? JSON.stringify([notice.id, notice.version]) : null;
}

export function getCurrentConsentNotice(
  signal?: AbortSignal,
): Promise<ConsentNoticeContext> {
  return apiRequest("consent-notices/current", { signal });
}

export function activateConsentNotice(
  input: ActivateConsentNoticeInput,
): Promise<ConsentNoticeContext> {
  return apiRequest("consent-notices/current", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
