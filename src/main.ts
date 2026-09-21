import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule,{
    rawBody: true, // Enable raw body parsing for Stripe webhook signature verification
  });
  app.use(compression());
  app.useBodyParser('json', { limit: '2mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });
  app.enableCors({
    origin: [process.env.FRONTEND_URL || 'http://localhost:5200',process.env.BACKEND_URL || 'http://localhost:8001'],
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
  await app.listen(process.env.PORT ?? 8001);
}
bootstrap();
