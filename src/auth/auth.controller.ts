import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';

import type {
  ForgetPasswordRequestDto,
  LoginRequestDto,
  ResetPasswordRequestDto,
  SignUpDtoRequestDto,
  VerifyResetCodeRequestDto,
} from './dto/auth.dto';

import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { GoogleRoleGuard } from 'src/guards/google-role.guard';

@Controller('finder')
export class FinderController {
  constructor(private readonly authService: AuthService) {}
  @Get()
  async find(@Query('search') search: string) {
    console.log('Searching for student with identifier:', search);
    return await this.authService.findStudent(search);
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignUpDtoRequestDto) {
    return this.authService.signup(dto);
  }

  @Post('signin')
  async signin(
    @Body() dto: LoginRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.signin(dto);
    const { password, ...userResponse } = user;

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    return { success: true, userResponse, accessToken, refreshToken };
  }

  @Post('forget-password')
  forgetPassword(@Body() dto: ForgetPasswordRequestDto) {
    return this.authService.forgetPassword(dto);
  }

  @Post('verify-reset-code')
  verifyResetCode(@Body() dto: VerifyResetCodeRequestDto) {
    return this.authService.verifyResetCode(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordRequestDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh_token')
  async refreshToken(@Req() req: any, @Res() res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) throw new UnauthorizedException();

      const tokens = await this.authService.refreshToken({ refreshToken });

      res.cookie('accessToken', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // Use 'lax' for same-domain or 'none' for cross-site
        path: '/',
      });

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(401).json({ message: 'Refresh failed' });
    }
  }

  @Get('google')
  @UseGuards(GoogleRoleGuard) // This guard MUST be the one forwarding the state
  async googleAuth(@Req() req) {
    // This method is empty; the AuthGuard handles the redirect to Google
  }

  // 2. This is the endpoint Google calls back to
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.googleLogin(req);
    const { accessToken, refreshToken, user } = result;

    const isProd = process.env.NODE_ENV === 'production';

    // Set Cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProd, // Must be false on localhost (HTTP)
      sameSite: isProd ? 'none' : 'lax', // 'lax' is required for localhost
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
    });

    // Determine redirect URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Check if user needs onboarding
    if (!user.isOnboarded) {
      return res.redirect(`${frontendUrl}/onboarding`);
    }

    return res.redirect(`${frontendUrl}/dashboard`);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getMe(@Req() req: any) {
    const { sub, email, role, isOnboarded } = req.user;

    return { sub, email, role, isOnboarded };
  }

  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return res.json({ success: true });
  }

  @Get('check-username')
  checkUsername(@Query('username') username: string) {
    return this.authService.checkUsername(username);
  }

  @Post('complete-profile')
  @UseGuards(AuthGuard('jwt'))
  async completeProfile(
    @Req() req: any,
    @Body() dto: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.sub;
    const { accessToken, refreshToken, user } =
      await this.authService.completeProfile(userId, dto);
    const { password, ...userResponse } = user;

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });

    return { success: true, userResponse };
  }

  @Get('my-profile')
  @UseGuards(AuthGuard('jwt'))
  async myProfile(@Req() req: any) {
    return this.authService.myProfile(req.user.sub);
  }

  @Patch('my-profile')
  @UseGuards(AuthGuard('jwt'))
  async updateMyProfile(@Req() req: any, @Body() dto: any) {
    return this.authService.updateMyProfile(req.user.sub, dto);
  }

  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  async changePassword(@Req() req: any, @Body() dto: any) {
    return this.authService.changePassword(req.user.sub, dto);
  }
}
