import { ApiProperty } from '@nestjs/swagger';
import {
  OperationClosureType,
  OperationTerminationCause,
  PoliticalOperationStage,
} from '../../../prisma/generated/prisma';

export const OPERATION_READINESS_OVERALL = [
  'READY',
  'ATTENTION',
  'BLOCKED',
] as const;

export type OperationReadinessOverall =
  (typeof OPERATION_READINESS_OVERALL)[number];

export const OPERATION_READINESS_CHECK_STATUS = [
  'PASS',
  'WARN',
  'BLOCK',
] as const;

export type OperationReadinessCheckStatus =
  (typeof OPERATION_READINESS_CHECK_STATUS)[number];

export class OperationReadinessCheckDto {
  @ApiProperty({ example: 'PROFILE_CONFIGURED' })
  code: string;

  @ApiProperty({ example: 'Perfil de la operacion' })
  label: string;

  @ApiProperty({ enum: OPERATION_READINESS_CHECK_STATUS })
  status: OperationReadinessCheckStatus;

  @ApiProperty({
    example: 'El perfil operativo esta configurado para esta organizacion.',
  })
  detail: string;

  @ApiProperty({ example: '/dashboard/operation-profile' })
  href: string;
}

export class OperationReadinessSectionsDto {
  @ApiProperty({ type: [OperationReadinessCheckDto] })
  BEFORE_CAMPAIGN: OperationReadinessCheckDto[];

  @ApiProperty({ type: [OperationReadinessCheckDto] })
  CAMPAIGN: OperationReadinessCheckDto[];

  @ApiProperty({ type: [OperationReadinessCheckDto] })
  ELECTION_DAY: OperationReadinessCheckDto[];

  @ApiProperty({ type: [OperationReadinessCheckDto] })
  POST_ELECTION: OperationReadinessCheckDto[];
}

export class OperationReadinessClosureDto {
  @ApiProperty({ enum: OperationClosureType })
  type: OperationClosureType;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  terminatedAt: string | null;

  @ApiProperty({ enum: OperationTerminationCause, nullable: true })
  cause: OperationTerminationCause | null;

  @ApiProperty({ example: false })
  complianceCertified: false;

  @ApiProperty({ example: false })
  authorityFilingCertified: false;
}

export class OperationReadinessResponseDto {
  @ApiProperty({ enum: PoliticalOperationStage, nullable: true })
  stage: PoliticalOperationStage | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2027-10-31T13:00:00.000Z',
  })
  electionDate: string | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2027-10-31',
  })
  votingStartDate: string | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2027-10-31',
  })
  votingEndDate: string | null;

  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    description:
      'Fuente HTTPS declarada para una ventana de varios dias; la plataforma no certifica su oficialidad.',
  })
  votingWindowSourceUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  votingWindowReference: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2027-10-31T12:00:00.000Z',
  })
  generatedAt: string;

  @ApiProperty({ enum: OPERATION_READINESS_OVERALL })
  overall: OperationReadinessOverall;

  @ApiProperty({ type: OperationReadinessSectionsDto })
  sections: OperationReadinessSectionsDto;

  @ApiProperty({ type: OperationReadinessClosureDto, nullable: true })
  closure: OperationReadinessClosureDto | null;
}
