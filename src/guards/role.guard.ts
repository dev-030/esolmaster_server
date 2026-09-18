import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, Roles } from 'src/decorator/role.decorator';

function matchRoles(requiredRoles: Role[], userRoles: Role | Role[]): boolean {
  const roles = Array.isArray(userRoles) ? userRoles : [userRoles];
  return requiredRoles.some((role) => roles.includes(role));
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride(Roles, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;

    const request = context.switchToHttp().getRequest();

    const user = request.user;

    return matchRoles(roles, user.role);
  }
}
