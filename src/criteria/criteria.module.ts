import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/database/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { GuardModule } from 'src/guards/guard.module';
import { CriteriaController } from './criteria.controller';
import { CriteriaService } from './criteria.service';

@Module({
  imports: [PrismaModule, AuthModule, GuardModule],
  controllers: [CriteriaController],
  providers: [CriteriaService],
})
export class CriteriaModule {}
