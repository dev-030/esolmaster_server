import { Inject, Injectable } from '@nestjs/common';
import { v2 as Cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class UploadService {
  constructor(
    @Inject('CLOUDINARY') private readonly cloudinary: typeof Cloudinary,
  ) {}

  private async uploadToCloudinary(
    file: Express.Multer.File,
    folder: string,
    resourceType: 'image' | 'video' = 'image',
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result?.secure_url as string);
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  async uploadSingleImage(
    file: Express.Multer.File,
    folder = 'vocubulary_images',
  ): Promise<string> {
    return this.uploadToCloudinary(file, folder, 'image');
  }


}
