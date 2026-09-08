import { CreateWitnessReportDto } from '../../witness/dto/create-witness-report.dto';

/** Offline sync uses the exact same traceability contract as web reports. */
export class SyncE14Dto extends CreateWitnessReportDto {}
