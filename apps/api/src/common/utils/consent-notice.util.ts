import { ConflictException, PreconditionFailedException } from '@nestjs/common';
import {
  ConsentPurpose,
  PoliticalOperationMode,
  Prisma,
} from '../../../prisma/generated/prisma';

export const CONSENT_NOTICE_VIEW_SELECT = {
  id: true,
  mode: true,
  purpose: true,
  version: true,
  title: true,
  content: true,
  controllerName: true,
  contactEmail: true,
  privacyPolicyUrl: true,
  activatedAt: true,
} satisfies Prisma.ConsentNoticeSelect;

export type ConsentNoticeView = Prisma.ConsentNoticeGetPayload<{
  select: typeof CONSENT_NOTICE_VIEW_SELECT;
}>;

type ConsentNoticeClient = Pick<Prisma.TransactionClient, 'consentNotice'>;

export function getConsentPurposeForMode(
  mode: PoliticalOperationMode,
): ConsentPurpose {
  return mode === PoliticalOperationMode.CAMPAIGN
    ? ConsentPurpose.POLITICAL_COMMUNICATION
    : ConsentPurpose.SERVICE_FOLLOW_UP;
}

export function findActiveConsentNotice(
  client: ConsentNoticeClient,
  tenantId: string,
  mode: PoliticalOperationMode,
  purpose = getConsentPurposeForMode(mode),
): Promise<ConsentNoticeView | null> {
  return client.consentNotice.findFirst({
    where: { tenantId, mode, purpose, isActive: true },
    select: CONSENT_NOTICE_VIEW_SELECT,
  });
}

export async function requireActiveConsentNotice(
  client: ConsentNoticeClient,
  tenantId: string,
  mode: PoliticalOperationMode,
  presentedVersion: string,
  purpose = getConsentPurposeForMode(mode),
): Promise<ConsentNoticeView> {
  const notice = await findActiveConsentNotice(client, tenantId, mode, purpose);
  if (!notice) {
    throw new PreconditionFailedException(
      'La organizacion debe configurar y activar su aviso de privacidad antes de registrar autorizaciones',
    );
  }

  if (notice.version !== presentedVersion) {
    throw new ConflictException(
      'El aviso de privacidad cambio. Recarga la pantalla, informa la version vigente y confirma nuevamente',
    );
  }

  return notice;
}
