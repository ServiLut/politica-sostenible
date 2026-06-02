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
  UseGuards,
} from '@nestjs/common';
import { LogisticsVotingService } from './logistics-voting.service';
import { UpdateTableDto } from './dto/update-table.dto';
import { UpdateVotingPlaceDto } from './dto/update-voting-place.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../../prisma/generated/prisma';

@Controller('logistics/voting-places')
@UseGuards(RolesGuard)
export class LogisticsVotingController {
  private readonly logger = new Logger(LogisticsVotingController.name);

  constructor(
    private readonly logisticsVotingService: LogisticsVotingService,
  ) {}

  @Get()
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
  )
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
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
  )
  async getDepartments() {
    return this.logisticsVotingService.getUniqueDepartments();
  }

  @Get('municipalities')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
  )
  async getMunicipalities(@Query('departamento') departamento: string) {
    return this.logisticsVotingService.getUniqueMunicipalities(departamento);
  }

  @Post()
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  async createVotingPlace(@Body() body: any) {
    this.logger.log(`Creando puesto de votación: ${JSON.stringify(body)}`);
    return this.logisticsVotingService.createVotingPlace(body);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  async updateVotingPlace(
    @Param('id') id: string,
    @Body() body: UpdateVotingPlaceDto,
  ) {
    this.logger.log(`Actualizando puesto ${id}: ${JSON.stringify(body)}`);
    return this.logisticsVotingService.updateVotingPlace(id, body);
  }

  @Get(':id/tables')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
  )
  async getTables(@Param('id') id: string) {
    return this.logisticsVotingService.getTableResults(id);
  }

  @Post(':id/complete')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
  )
  async markAsComplete(
    @Param('id') id: string,
    @Body() body: { isComplete: boolean },
  ) {
    this.logger.log(`Marcando puesto ${id} como completo: ${body.isComplete}`);
    return this.logisticsVotingService.markAsComplete(id, body.isComplete);
  }

  @Post(':id/tables')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
  )
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
