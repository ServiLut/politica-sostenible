import { Controller, Get, Query } from '@nestjs/common';
import { VotingPlacesService } from './voting-places.service';

@Controller('voting-places')
export class VotingPlacesController {
  constructor(private readonly votingPlacesService: VotingPlacesService) {}

  @Get()
  async getVotingPlaces(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('municipio') municipio?: string,
  ) {
    return this.votingPlacesService.getVotingPlaces(
      limit ? parseInt(limit, 10) : 5000,
      offset ? parseInt(offset, 10) : 0,
      municipio,
    );
  }
}
