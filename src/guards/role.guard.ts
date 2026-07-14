import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, Roles } from 'src/decorator/role.decorator';

function matchRoles(requiredRoles: Role[], userRoles: Role[]): boolean {
  return requiredRoles.some((role) => userRoles.includes(role));
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get(Roles, context.getHandler());
    if (!roles) return true;

    const request = context.switchToHttp().getRequest();

    const user = request.user;

    return matchRoles(roles, user.role);
  }
}
