import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { Role } from '../database/prisma-client/enums'; // Ensure this path is correct for your Prisma enums

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL')!,
      scope: ['email', 'profile'],
      /* 
         CRITICAL: This must be true so that 'req' is passed as the first 
         argument to the validate method. This allows us to see the query 
         params (state) returned by Google.
      */
      passReqToCallback: true,
    });
  }

  async validate(
    req: any, // req is now available because of passReqToCallback: true
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const { name, emails, photos } = profile;
    let roleIntent: Role | null = null;

    /* 
       1. EXTRACT ROLE FROM STATE
       When Google redirects back to our callback, it appends the 'state' 
       parameter we sent during the initial request.
    */
    if (req.query && req.query.state) {
      try {
        // Google might URI encode the state string (e.g., %7B%22role%22...)
        const rawState = decodeURIComponent(req.query.state);
        const parsedState = JSON.parse(rawState);

        if (parsedState.role) {
          roleIntent = parsedState.role as Role;
        }
      } catch (error) {
        // Log error but don't crash the auth flow; user will fall back to default role
        console.error('GoogleStrategy: Failed to parse state JSON', error);
      }
    }

    /* 
       2. CONSTRUCT USER OBJECT
       This object is what 'req.user' will become in your AuthController.
    */
    const user = {
      email: emails[0].value,
      firstName: name.givenName,
      lastName: name.familyName,
      picture: photos?.[0]?.value,
      accessToken,
      refreshToken,
      roleIntent, // This now contains 'student' or 'teacher'
    };

    // Debugging: Helpful to see in the terminal during development
    console.log(
      `[Google Auth] User: ${user.email}, Detected Role Intent: ${roleIntent}`,
    );

    done(null, user);
  }
}
