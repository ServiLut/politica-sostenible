import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

enum VotingStatusInput {
  VOTED = 'VOTED',
  NEEDS_TRANSPORT = 'NEEDS_TRANSPORT',
  NO_SHOW = 'NO_SHOW',
  PENDING = 'PENDING',
}

export class UpdateVotingStatusDto {
  @IsEnum(VotingStatusInput)
  status: VotingStatusInput;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
