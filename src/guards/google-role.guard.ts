// auth/guards/google-role.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleRoleGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    // This takes the 'state' from your frontend link and 
    // passes it to Google.
    return {
      state: request.query.state, 
    };
  }
}