import { IsEnum } from 'class-validator';
import { VotingStatus } from '../../../prisma/generated/prisma';

export class UpdateVotingStatusDto {
  @IsEnum(VotingStatus)
  status: VotingStatus;
}
