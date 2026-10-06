import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  PlanFeature,
  RequiresPlanFeature,
} from '../auth/decorators/requires-plan-feature.decorator';
import { BlockWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreatePersonImportDto,
  PersonImportIdDto,
  PersonImportPageDto,
} from './dto/person-import.dto';
import { PersonImportService } from './person-import.service';

/** Stop producing private rows when the HTTP consumer disconnects. */
export function waitForCsvDrain(res: Response): Promise<boolean> {
  if (res.destroyed) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      res.off('drain', drained);
      res.off('close', closed);
      res.off('error', failed);
    };
    const drained = () => {
      cleanup();
      resolve(true);
    };
    const closed = () => {
      cleanup();
      resolve(false);
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };
    res.once('drain', drained);
    res.once('close', closed);
    res.once('error', failed);
    if (res.destroyed) closed();
  });
}

@Controller('import/personas')
@Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
@RequiresPlanFeature(PlanFeature.IMPORT)
export class PersonImportController {
  constructor(private readonly imports: PersonImportService) {}
  @Get('options')
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.imports.options(user);
  }
  @Get('jobs')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PersonImportPageDto,
  ) {
    return this.imports.list(user, query);
  }
  @Post('jobs')
  @BlockWhenOperationClosed()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePersonImportDto,
  ) {
    return this.imports.create(user, dto);
  }
  @Get('jobs/:id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PersonImportIdDto,
  ) {
    return this.imports.get(user, params.id);
  }
  @Post('jobs/:id/execute')
  @BlockWhenOperationClosed()
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PersonImportIdDto,
  ) {
    return this.imports.execute(user, params.id);
  }
  @Post('jobs/:id/retry')
  @BlockWhenOperationClosed()
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PersonImportIdDto,
  ) {
    return this.imports.retry(user, params.id);
  }
  @Get('jobs/:id/errors')
  errors(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PersonImportIdDto,
    @Query() query: PersonImportPageDto,
  ) {
    return this.imports.errors(user, params.id, query);
  }
  @Get('jobs/:id/errors.csv')
  async errorCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PersonImportIdDto,
    @Res() res: Response,
  ) {
    const chunks = this.imports.errorCsv(user, params.id);
    const first = await chunks.next(); // Authorization must finish before sending headers.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="errores-personas-${params.id}.csv"`,
    );
    try {
      if (!first.done && !res.destroyed && !res.write(first.value)) {
        if (!(await waitForCsvDrain(res))) return;
      }
      for await (const chunk of chunks) {
        if (res.destroyed) break;
        if (!res.write(chunk) && !(await waitForCsvDrain(res))) break;
      }
      if (!res.destroyed) res.end();
    } finally {
      await chunks.return(undefined);
    }
  }
}
