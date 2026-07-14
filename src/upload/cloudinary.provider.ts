import { v2 as cloudinary } from 'cloudinary';

export const CloudinaryProvider = {
  provide: 'CLOUDINARY',
  useFactory: () => {
    cloudinary.config({
      url: process.env.CLOUDINARY_URL,
      secure: true,
    });
    return cloudinary;
  },
};
