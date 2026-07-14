import { User, Role } from 'src/database/prisma-client/client';

export type SignUpDtoRequestDto = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: Role;

  // student only
  username?: string;

  // teacher only
  subject?: string;
  institution?: string;
  bio?: string;
};

export type LoginRequestDto = Pick<User, 'email' | 'password'>;

export type ForgetPasswordRequestDto = Pick<User, 'email'>;

export type VerifyResetCodeRequestDto = {
  email: string;
  code: string;
};

export type ResetPasswordRequestDto = {
  password: string;
  confirmPassword: string;
  // Short-lived token issued by the verify-reset-code step
  resetToken: string;
};

export type UserResponseDto = Pick<
  User,
  | 'id'
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'role'
  | 'createdAt'
  | 'updatedAt'
>;