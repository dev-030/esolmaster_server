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

  async uploadTemporaryPdf(file: Express.Multer.File): Promise<{ secure_url: string, public_id: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        { folder: 'temp_pdfs', resource_type: 'image' },
        (error, result) => {
          if (error) return reject(error);
          resolve({ secure_url: result?.secure_url as string, public_id: result?.public_id as string });
        },
      );
      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  generateCropUrl(publicId: string, page: number, x: number, y: number, w: number, h: number): string {
    return this.cloudinary.url(publicId, {
      page,
      format: 'png',
      transformation: [
        { crop: 'crop', gravity: 'north_west', x, y, width: w, height: h, flags: 'relative' }
      ]
    });
  }

  async deleteFile(publicId: string): Promise<void> {
    await this.cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  }
}
