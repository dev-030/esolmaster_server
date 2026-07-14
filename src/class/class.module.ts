import { Module } from '@nestjs/common';
import { ClassService } from './class.service';
import { ClassController } from './class.controller';
import { PrismaModule } from 'src/database/prisma.module';
import { GuardModule } from 'src/guards/guard.module';

@Module({
  imports: [PrismaModule,GuardModule],
  controllers: [ClassController],
  providers: [ClassService],
})
export class ClassModule {}
