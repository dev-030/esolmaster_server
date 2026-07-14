import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { CloudinaryProvider } from './cloudinary.provider';

@Module({
  providers: [UploadService, CloudinaryProvider],
  exports: [UploadService],
})
export class UploadModule {}

