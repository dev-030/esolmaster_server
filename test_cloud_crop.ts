import * as dotenv from 'dotenv';
dotenv.config();
import { v2 as Cloudinary } from 'cloudinary';

async function run() {
  const url = Cloudinary.url('temp_pdfs/s1ykaauvcpe7gb7kkgbd', { 
    page: 2, 
    format: 'png',
    transformation: [
      { crop: 'crop', x: 0.1, y: 0.2, width: 0.8, height: 0.6, flags: 'relative' }
    ]
  });
  console.log("Cropped URL:", url);
}
run();
