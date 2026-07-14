import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  console.log(process.env.PORT);
  console.log('JWT_SECRET:', process.env.JWT_SECRET);
  const app = await NestFactory.create(AppModule,{
    rawBody: true, // Enable raw body parsing for Stripe webhook signature verification
  });
  app.enableCors({
    origin: [process.env.FRONTEND_URL || 'http://localhost:5200',process.env.BACKEND_URL || 'http://localhost:5300'],
    credentials: true,
  });
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // removes extra fields
      transform: true, // converts types automatically
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
