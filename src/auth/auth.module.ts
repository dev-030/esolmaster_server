import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController, FinderController } from './auth.controller';
import { PrismaModule } from 'src/database/prisma.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule } from 'src/mail/mail.module';
import { GoogleStrategy } from './google.strategy';
import { JwtStrategy } from './jwt.strategy';
import { GuardModule } from 'src/guards/guard.module';

  console.log('JWT_SECRET: on auth module', process.env.JWT_SECRET);

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: configService.get<number>('JWT_EXPIRES_IN') || '1m' },
      }),
      inject: [ConfigService],
    }),

    MailModule,
    GuardModule,
  ],
  controllers: [AuthController,FinderController],
  providers: [AuthService, GoogleStrategy, JwtStrategy],
})
export class AuthModule {}