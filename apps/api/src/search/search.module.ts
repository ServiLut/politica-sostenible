import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { CommitmentsModule } from '../commitments/commitments.module';
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [PrismaModule, TasksModule, CommitmentsModule, CasesModule],
  providers: [SearchService],
  controllers: [SearchController],
})
export class SearchModule {}
