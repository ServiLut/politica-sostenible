import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CommunicationApprovalStatus } from '../../../prisma/generated/prisma';

const FINAL_DECISIONS = [
  CommunicationApprovalStatus.APPROVED,
  CommunicationApprovalStatus.REJECTED,
] as const;

export class DecideCommunicationApprovalDto {
  @IsIn(FINAL_DECISIONS)
  status: (typeof FINAL_DECISIONS)[number];

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  decisionReason: string;
}
