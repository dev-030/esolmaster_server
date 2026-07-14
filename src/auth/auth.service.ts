import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
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
      secret: process.env.JWT_SECRET,
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
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
      const payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: process.env.JWT_SECRET,
      });

      // IMPORTANT: Remove iat and exp so the new token gets fresh ones
      const { iat, exp, ...cleanPayload } = payload;

      return this.generateTokens(cleanPayload);
    } catch (error) {
      const err = error as { message?: string };
      // This will help you see if the refresh token itself is expired
      console.error('JWT Verification Error:', err.message);
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

    console.log('Searching for student with identifier:', value);

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

    console.log('Student result:', student);

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
}
