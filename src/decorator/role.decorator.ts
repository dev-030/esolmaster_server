import { Reflector } from '@nestjs/core';
import { Role as UserRole } from 'src/database/prisma-client/enums';

export const ROLES:UserRole[] = ['admin', 'student', 'teacher'];

export type Role = (typeof ROLES)[number];

export const Roles = Reflector.createDecorator<Role[]>();
