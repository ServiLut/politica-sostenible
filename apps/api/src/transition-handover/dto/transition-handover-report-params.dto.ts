import { IsUUID } from 'class-validator';

export class TransitionHandoverReportParamsDto {
  @IsUUID('4')
  reportId: string;
}
