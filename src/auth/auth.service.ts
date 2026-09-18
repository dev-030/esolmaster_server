import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as geoip from 'geoip-lite';
import { MailService } from 'src/mail/mail.service';
import { calculateLevel } from 'common/utils/calculationxp';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  private async generateTokens(payload: any) {
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '5h',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
      accessTokenMaxAge: 5 * 60 * 60 * 1000,   // 5h in ms
      refreshTokenMaxAge: 7 * 24 * 60 * 60 * 1000, // 7d in ms
    };
  }

  async signup(dto: any) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    if (dto.role === 'admin') {
      throw new BadRequestException('Cannot sign up as admin');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const freePlan =
      dto.role === 'teacher'
        ? await this.prisma.subscriptionPlan.findFirst({
            where: {
              type: 'FREE',
              isActive: true,
            },
          })
        : null;

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          password: hashedPassword,
          role: dto.role,
          isOnboarded: true,
        },
      });

      if (dto.role === 'student') {
        await tx.studentProfile.create({
          data: {
            userId: user.id,
            username: dto.username,
          },
        });
      }

      if (dto.role === 'teacher') {
        await tx.teacherProfile.create({
          data: {
            userId: user.id,
            subject: dto.subject,
            institution: dto.institution,
            bio: dto.bio,
          },
        });

        if (!freePlan) {
          throw new BadRequestException('Free plan not configured');
        }

        await tx.userSubscription.create({
          data: {
            userId: user.id,
            planId: freePlan.id,
            billingStatus: 'ACTIVE',
            billingCycle: null,
            boughtPrice: 0,
            discountAmount: 0,
            finalPrice: 0,
          },
        });
      }

      return user;
    });

    const { password, ...updatedUser } = result;

    return {
      updatedUser,
      message: 'Signup successful',
    };
  }

  async signin(dto: any) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);

    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isOnboarded: user.isOnboarded,
    };

    const tokens = await this.generateTokens(payload);

    return {
      user,
      ...tokens,
    };
  }

  async googleLogin(req: any) {
    const googleUser = req.user;

    let user = await this.prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (!user) {
      user = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: googleUser.email,
            firstName: googleUser.firstName,
            lastName: googleUser.lastName,
            role: googleUser.roleIntent || 'student',
            isOnboarded: false,
          },
        });

        if ((googleUser.roleIntent || 'student') === 'teacher') {
          const freePlan = await tx.subscriptionPlan.findFirst({
            where: {
              type: 'FREE',
              isActive: true,
            },
          });

          if (freePlan) {
            await tx.userSubscription.create({
              data: {
                userId: createdUser.id,
                planId: freePlan.id,
                billingStatus: 'ACTIVE',
                billingCycle: null,
                boughtPrice: 0,
                discountAmount: 0,
                finalPrice: 0,
              },
            });
          }
        }

        return createdUser;
      });
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isOnboarded: user.isOnboarded,
    };

    const tokens = await this.generateTokens(payload);

    return { user, ...tokens };
  }

  private static readonly RESET_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly RESET_MAX_ATTEMPTS = 5;

  /**
   * Step 1 — request a reset code. Always returns a generic message so we never
   * reveal whether an email is registered. If the user exists we generate a
   * 6-digit code, store its hash, and email the plaintext code.
   */
  async forgetPassword(dto: any) {
    const genericResponse = {
      message: 'If an account exists for this email, a reset code has been sent.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) return genericResponse;

    // Generate a 6-digit numeric code
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + AuthService.RESET_CODE_TTL_MS);

    // Invalidate any previous codes for this user, then store the new one
    await this.prisma.$transaction([
      this.prisma.passwordResetCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.passwordResetCode.create({
        data: { userId: user.id, codeHash, expiresAt },
      }),
    ]);

    await this.mailService.sendResetPasswordCode(user.email, code);

    return genericResponse;
  }

  /**
   * Step 2 — verify the code. On success returns a short-lived reset token that
   * authorizes the actual password change (so the code is only checked once).
   */
  async verifyResetCode(dto: any) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new BadRequestException('Invalid or expired code');

    const record = await this.prisma.passwordResetCode.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired code');
    }

    if (record.attempts >= AuthService.RESET_MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many attempts. Please request a new code.',
      );
    }

    const isMatch = await bcrypt.compare(String(dto.code ?? ''), record.codeHash);
    if (!isMatch) {
      await this.prisma.passwordResetCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid or expired code');
    }

    const resetToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, purpose: 'password_reset', rid: record.id },
      { secret: process.env.JWT_SECRET, expiresIn: '10m' },
    );

    return { message: 'Code verified', resetToken };
  }

  /**
   * Step 3 — set the new password using the reset token from step 2.
   */
  async resetPassword(dto: any) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    let payload: {
      sub?: string;
      email?: string;
      purpose?: string;
      rid?: string;
    };
    try {
      payload = await this.jwtService.verifyAsync(dto.resetToken, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (payload.purpose !== 'password_reset' || !payload.sub || !payload.rid) {
      throw new BadRequestException('Invalid reset token');
    }

    // The code must still be unconsumed — prevents token replay
    const record = await this.prisma.passwordResetCode.findUnique({
      where: { id: payload.rid },
    });
    if (!record || record.consumedAt || record.userId !== payload.sub) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: payload.sub },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    return { message: 'Password reset successful' };
  }

  async refreshToken(dto: any) {
    try {
      // Use the dedicated refresh secret to verify the token
      const payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      });

      // Verify the user still exists in the database
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found or session expired');
      }

      // Remove iat and exp so the new token gets fresh timestamps
      const { iat, exp, ...cleanPayload } = payload;

      // Return both new tokens (rotation)
      return this.generateTokens(cleanPayload);
    } catch (error) {
      const err = error as { message?: string };
      console.error('JWT Refresh Verification Error:', err.message);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async checkUsername(username: string) {
    if (!username) {
      return { available: false };
    }

    const existing = await this.prisma.studentProfile.findUnique({
      where: { username },
    });

    return {
      available: !existing,
    };
  }

  async completeProfile(userId: string, dto: any) {
    // 1. Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User not found');

    // 2. Use UPSERT instead of update to handle missing profile records
    if (user.role === 'student') {
      await this.prisma.studentProfile.upsert({
        where: { userId: userId },
        // If profile doesn't exist, create it
        create: {
          userId: userId,
          username: dto.username,
        },
        // If profile exists, update it
        update: {
          username: dto.username,
        },
      });
    }

    if (user.role === 'teacher') {
      await this.prisma.teacherProfile.upsert({
        where: { userId: userId },
        create: {
          userId: userId,
          subject: dto.subject,
          institution: dto.institution,
          bio: dto.bio,
        },
        update: {
          subject: dto.subject,
          institution: dto.institution,
          bio: dto.bio,
        },
      });
    }

    // 3. Finally, update the User's onboarded status
    // We do this separately to ensure it happens regardless of the profile type
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isOnboarded: true },
    });

    // 4. Generate new tokens with the updated isOnboarded: true payload
    const payload = {
      sub: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      isOnboarded: true,
    };

    const tokens = await this.generateTokens(payload);

    return {
      user: updatedUser,
      ...tokens,
    };
  }

  async findStudent(identifier: string) {
    const value = identifier.trim();

    const student = await this.prisma.studentProfile.findFirst({
      where: {
        username: {
          contains: value,
          mode: 'insensitive',
        },
      },
      select: {
        username: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            avatarUrl: true,
          },
        },
      },
    });

    return student;
  }

  async myProfile(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      student: true,
      teacher: true,
    },
  });

  if (!user) {
    throw new NotFoundException("User not found");
  }

  // STUDENT RESPONSE
  if (user.role === "student" && user.student) {
    const levelInfo = calculateLevel(user.student.totalXp);

    return {
      role: "student",
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      username: user.student.username,
      totalXp: user.student.totalXp,

      level: levelInfo.level,
      xpIntoLevel: levelInfo.xpIntoLevel,
      xpNeededForNextLevel: levelInfo.xpNeededForNextLevel,
      progressPercentage: levelInfo.progressPercentage,
    };
  }

  // TEACHER RESPONSE
  if (user.role === "teacher" && user.teacher) {
    return {
      role: "teacher",
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      teacherProfile: {
        subject: user.teacher.subject,
        institution: user.teacher.institution,
        bio: user.teacher.bio,
      },
    };
  }

  // ADMIN OR OTHER
  return {
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

  /**
   * Update the caller's own name (+ teacher-only institution/bio). Email is
   * intentionally not editable here — changing it needs its own
   * verification flow, which is out of scope for a profile-settings form.
   */
  async updateMyProfile(userId: string, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName ?? user.firstName,
        lastName: dto.lastName ?? user.lastName,
      },
    });

    if (user.role === 'teacher' && (dto.institution !== undefined || dto.bio !== undefined)) {
      await this.prisma.teacherProfile.update({
        where: { userId },
        data: {
          ...(dto.institution !== undefined ? { institution: dto.institution } : {}),
          ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        },
      });
    }

    return this.myProfile(userId);
  }

  /**
   * Change password while authenticated. If the account has no password yet
   * (e.g. Google-only signup), currentPassword is not required.
   */
  async changePassword(userId: string, dto: any) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.password) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required');
      }
      const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
      if (!isMatch) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password updated successfully' };
  }

  private static readonly EMAIL_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  async sendEmailChangeOtp(userId: string, dto: { newEmail: string }) {
    const { newEmail } = dto;

    // Check that the new email is not already taken
    const existing = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (existing) throw new BadRequestException('This email address is already in use.');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + AuthService.EMAIL_CODE_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.emailChangeCode.deleteMany({ where: { userId } }),
      this.prisma.emailChangeCode.create({
        data: { userId, newEmail, codeHash, expiresAt },
      }),
    ]);

    await this.mailService.sendEmailChangeCode(newEmail, code);
    return { message: 'Verification code sent to your new email address.' };
  }

  async verifyEmailChangeOtp(userId: string, dto: { newEmail: string; code: string }) {
    const record = await this.prisma.emailChangeCode.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record || record.newEmail !== dto.newEmail || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired code.');
    }

    if (record.attempts >= 5) {
      throw new BadRequestException('Too many attempts. Please request a new code.');
    }

    const isMatch = await bcrypt.compare(String(dto.code ?? ''), record.codeHash);
    if (!isMatch) {
      await this.prisma.emailChangeCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid or expired code.');
    }

    // Check again that email is not taken (race condition)
    const existing = await this.prisma.user.findUnique({ where: { email: dto.newEmail } });
    if (existing) throw new BadRequestException('This email address is already in use.');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { email: dto.newEmail },
      }),
      this.prisma.emailChangeCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    return { message: 'Email address updated successfully.' };
  }

  // ─── Active Authorized Sessions ──────────────────────────────────────────
  async getSessions(userId: string, req: any) {
    const forwarded = req.headers['x-forwarded-for'];
    let ip = '';
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      ip = forwarded.split(',')[0].trim();
    } else if (Array.isArray(forwarded) && forwarded.length > 0) {
      ip = forwarded[0].trim();
    } else {
      ip = req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip || '127.0.0.1';
    }

    if (ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '');
    }

    const uaString = req.headers['user-agent'] || '';
    let browser = 'Web Browser';
    let os = 'Unknown OS';
    let deviceType = 'desktop';

    if (/iPad/i.test(uaString)) {
      deviceType = 'tablet';
    } else if (/Mobile|Android|iPhone|iPod/i.test(uaString)) {
      deviceType = 'mobile';
    } else {
      deviceType = 'desktop';
    }

    if (/iPhone|iPad|iPod/i.test(uaString)) {
      os = 'iOS';
    } else if (/Android/i.test(uaString)) {
      os = 'Android';
    } else if (/Mac OS X|Macintosh/i.test(uaString)) {
      os = 'macOS';
    } else if (/Windows NT/i.test(uaString)) {
      os = 'Windows';
    } else if (/Linux/i.test(uaString)) {
      os = 'Linux';
    }

    if (/Edg\//i.test(uaString)) {
      browser = 'Microsoft Edge';
    } else if (/Chrome\//i.test(uaString)) {
      browser = 'Google Chrome';
    } else if (/Firefox\//i.test(uaString)) {
      browser = 'Mozilla Firefox';
    } else if (/Safari\//i.test(uaString)) {
      browser = 'Apple Safari';
    } else if (/Opera|OPR\//i.test(uaString)) {
      browser = 'Opera';
    }

    const isLocal =
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip.startsWith('172.');

    let city = 'Local Network';
    let country = 'Localhost';

    if (!isLocal) {
      const geo = geoip.lookup(ip);
      if (geo) {
        city = geo.city || 'Unknown City';
        country = geo.country || 'Unknown Country';
      }
    }

    // Stable device identification
    const clientDeviceId = req.headers['x-device-id']
      ? String(req.headers['x-device-id']).trim()
      : '';
    const deviceKey = clientDeviceId
      ? `dev:${userId}:${clientDeviceId}`
      : `fp:${userId}:${os}:${browser}:${deviceType}`;
    const currentToken = crypto.createHash('sha256').update(deviceKey).digest('hex').slice(0, 32);

    // Normalize OS for lookup
    const osVariants = os === 'macOS' ? ['macOS', 'macOS'] : [os];

    // Check if session already exists for this device
    const existingSessionsForDevice = await this.prisma.userSession.findMany({
      where: {
        userId,
        OR: [
          { sessionToken: currentToken },
          {
            os: { in: osVariants },
            browser,
            deviceType,
          },
        ],
      },
      orderBy: { lastActiveAt: 'desc' },
    });

    let currentSessionId = '';

    if (existingSessionsForDevice.length > 0) {
      const primarySession = existingSessionsForDevice[0];
      currentSessionId = primarySession.id;

      await this.prisma.userSession.update({
        where: { id: primarySession.id },
        data: {
          sessionToken: currentToken,
          lastActiveAt: new Date(),
          ipAddress: ip,
          city,
          country,
          userAgent: uaString,
          browser,
          os: 'macOS',
          deviceType,
        },
      });

      // Delete any duplicates for this exact device
      if (existingSessionsForDevice.length > 1) {
        const duplicateIds = existingSessionsForDevice.slice(1).map((s) => s.id);
        await this.prisma.userSession.deleteMany({
          where: { id: { in: duplicateIds } },
        });
      }
    } else {
      const newSession = await this.prisma.userSession.create({
        data: {
          userId,
          sessionToken: currentToken,
          userAgent: uaString,
          browser,
          os: os === 'macOS' ? 'macOS' : os,
          deviceType,
          ipAddress: ip,
          city,
          country,
          lastActiveAt: new Date(),
        },
      });
      currentSessionId = newSession.id;
    }

    // Clean up any historical duplicate sessions for this user across all devices
    const allUserSessions = await this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
    });

    const seenDevices = new Set<string>();
    const duplicateIdsToDelete: string[] = [];
    const uniqueSessions: typeof allUserSessions = [];

    for (const s of allUserSessions) {
      const normalizedOs = (s.os || 'unknown').toLowerCase() === 'macos' ? 'macOS' : s.os || 'unknown';
      const key = `${normalizedOs}:${s.browser || 'unknown'}:${s.deviceType || 'unknown'}`;
      if (seenDevices.has(key)) {
        duplicateIdsToDelete.push(s.id);
      } else {
        seenDevices.add(key);
        // Ensure OS is formatted as macOS
        if ((s.os || '').toLowerCase() === 'macos') {
          s.os = 'macOS';
        }
        uniqueSessions.push(s);
      }
    }

    if (duplicateIdsToDelete.length > 0) {
      await this.prisma.userSession.deleteMany({
        where: { id: { in: duplicateIdsToDelete } },
      });
    }

    return uniqueSessions.map((s) => ({
      id: s.id,
      browser: s.browser || 'Web Browser',
      os: (s.os || '').toLowerCase() === 'macos' ? 'macOS' : s.os || 'Unknown OS',
      deviceType: s.deviceType || 'desktop',
      ipAddress: s.ipAddress || '127.0.0.1',
      city: s.city || 'Local Network',
      country: s.country || 'Localhost',
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      isCurrent: s.id === currentSessionId || s.sessionToken === currentToken,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.prisma.userSession.deleteMany({
      where: { id: sessionId, userId },
    });
    return { success: true, message: 'Session revoked successfully' };
  }

  async revokeAllOtherSessions(userId: string, req: any) {
    const uaString = req.headers['user-agent'] || '';
    let browser = 'Web Browser';
    let os = 'Unknown OS';
    let deviceType = 'desktop';

    if (/iPad/i.test(uaString)) {
      deviceType = 'tablet';
    } else if (/Mobile|Android|iPhone|iPod/i.test(uaString)) {
      deviceType = 'mobile';
    } else {
      deviceType = 'desktop';
    }

    if (/iPhone|iPad|iPod/i.test(uaString)) {
      os = 'iOS';
    } else if (/Android/i.test(uaString)) {
      os = 'Android';
    } else if (/Mac OS X|Macintosh/i.test(uaString)) {
      os = 'macOS';
    } else if (/Windows NT/i.test(uaString)) {
      os = 'Windows';
    } else if (/Linux/i.test(uaString)) {
      os = 'Linux';
    }

    if (/Edg\//i.test(uaString)) {
      browser = 'Microsoft Edge';
    } else if (/Chrome\//i.test(uaString)) {
      browser = 'Google Chrome';
    } else if (/Firefox\//i.test(uaString)) {
      browser = 'Mozilla Firefox';
    } else if (/Safari\//i.test(uaString)) {
      browser = 'Apple Safari';
    } else if (/Opera|OPR\//i.test(uaString)) {
      browser = 'Opera';
    }

    const clientDeviceId = req.headers['x-device-id']
      ? String(req.headers['x-device-id']).trim()
      : '';
    const deviceKey = clientDeviceId
      ? `dev:${userId}:${clientDeviceId}`
      : `fp:${userId}:${os}:${browser}:${deviceType}`;
    const currentToken = crypto.createHash('sha256').update(deviceKey).digest('hex').slice(0, 32);

    await this.prisma.userSession.deleteMany({
      where: {
        userId,
        sessionToken: { not: currentToken },
      },
    });
    return { success: true, message: 'All other sessions revoked successfully' };
  }
}
