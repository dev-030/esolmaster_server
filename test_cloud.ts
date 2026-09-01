import { UploadService } from './src/upload/upload.service';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();
import { v2 as Cloudinary } from 'cloudinary';

async function run() {
  const uploadToCloudinary = (fileBuffer: Buffer, folder: string) => {
    return new Promise((resolve, reject) => {
      const uploadStream = Cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      const { Readable } = require('stream');
      Readable.from(fileBuffer).pipe(uploadStream);
    });
  };

  const pdfBuffer = fs.readFileSync('../ESOL_Entry1_Reading_PracticePaper_SetA_TUTOR.pdf');
  const res: any = await uploadToCloudinary(pdfBuffer, 'temp_pdfs');
  console.log("Uploaded! URL:", res.secure_url);
  console.log("Public ID:", res.public_id);
  
  // Try to construct URL for page 2
  const urlPage2 = Cloudinary.url(res.public_id, { page: 2, format: 'png' });
  console.log("Page 2 URL:", urlPage2);
}
run();
