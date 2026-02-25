import {
  Controller,
  Get,
  Query,
  Post,
  Patch,
  Body,
  Param,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { LogisticsVotingService } from './logistics-voting.service';
import { UpdateTableDto } from './dto/update-table.dto';
import { UpdateVotingPlaceDto } from './dto/update-voting-place.dto';

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
    this.logger.log(
      `Consultando puestos: page=${page}, limit=${limit}, muni=${municipio}, dept=${departamento}, nombre=${nombre}`,
    );
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
    this.logger.log(`Creando puesto de votación: ${JSON.stringify(body)}`);
    return this.logisticsVotingService.createVotingPlace(body);
  }

  @Patch(':id')
  async updateVotingPlace(
    @Param('id') id: string,
    @Body() body: UpdateVotingPlaceDto,
  ) {
    this.logger.log(`Actualizando puesto ${id}: ${JSON.stringify(body)}`);
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
    this.logger.log(`Marcando puesto ${id} como completo: ${body.isComplete}`);
    return this.logisticsVotingService.markAsComplete(id, body.isComplete);
  }

  @Post(':id/tables')
  async updateTable(@Param('id') id: string, @Body() body: UpdateTableDto) {
    this.logger.log(`RECIBIDO Post tables - ID: ${id}`);
    this.logger.log(`BODY RECIBIDO: ${JSON.stringify(body)}`);
    try {
      const result = await this.logisticsVotingService.addOrUpdateTableResult(
        id,
        body.mesaNumero,
        body.votosCandidato,
        body.votosBlanco,
        body.votosTotales,
      );
      this.logger.log(`Mesa actualizada con éxito: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error actualizando mesa: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Error al guardar los votos de la mesa',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
