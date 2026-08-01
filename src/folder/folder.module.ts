import { Module } from '@nestjs/common';
import { FolderService } from './folder.service';
import { FolderController } from './folder.controller';
import { PrismaModule } from 'src/database/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { GuardModule } from 'src/guards/guard.module';

@Module({
  imports: [PrismaModule, AuthModule, GuardModule],
  controllers: [FolderController],
  providers: [FolderService],
})
export class FolderModule {}
