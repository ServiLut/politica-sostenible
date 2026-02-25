import {
  Controller,
  Get,
  Query,
  Post,
  Patch,
  Body,
  Param,
  Logger,
} from '@nestjs/common';
import { LogisticsVotingService } from './logistics-voting.service';

@Controller('logistics/voting-places')
export class LogisticsVotingController {
  private readonly logger = new Logger(LogisticsVotingController.name);

  constructor(
    private readonly logisticsVotingService: LogisticsVotingService,
  ) {}

  @Get()
  async getVotingPlaces(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('municipio') municipio?: string,
    @Query('departamento') departamento?: string,
    @Query('nombre') nombre?: string,
  ) {
    return this.logisticsVotingService.getVotingPlaces(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      municipio,
      departamento,
      nombre,
    );
  }

  @Get('departments')
  async getDepartments() {
    return this.logisticsVotingService.getUniqueDepartments();
  }

  @Get('municipalities')
  async getMunicipalities(@Query('departamento') departamento: string) {
    return this.logisticsVotingService.getUniqueMunicipalities(departamento);
  }

  @Post()
  async createVotingPlace(@Body() body: any) {
    return this.logisticsVotingService.createVotingPlace(body);
  }

  @Patch(':id')
  async updateVotingPlace(
    @Param('id') id: string,
    @Body() body: { totalMesas?: number; nombre?: string; direccion?: string },
  ) {
    return this.logisticsVotingService.updateVotingPlace(id, body);
  }

  @Get(':id/tables')
  async getTables(@Param('id') id: string) {
    return this.logisticsVotingService.getTableResults(id);
  }

  @Post(':id/complete')
  async markAsComplete(
    @Param('id') id: string,
    @Body() body: { isComplete: boolean },
  ) {
    return this.logisticsVotingService.markAsComplete(id, body.isComplete);
  }

  @Post(':id/tables')
  async updateTable(
    @Param('id') id: string,
    @Body()
    body: { mesaNumero: number; votosCandidato: number; votosTotales: number },
  ) {
    return this.logisticsVotingService.addOrUpdateTableResult(
      id,
      body.mesaNumero,
      body.votosCandidato,
      body.votosTotales,
    );
  }
}
