import { IsEnum } from 'class-validator';
import { CampaignEventStatus } from '../../../prisma/generated/prisma';

export class TransitionCampaignEventDto {
  @IsEnum(CampaignEventStatus)
  status: CampaignEventStatus;
}
