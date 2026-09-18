import { RolesGuard } from './role.guard';

describe('RolesGuard', () => {
  const context = {
    getHandler: () => 'handler',
    getClass: () => 'controller',
    switchToHttp: () => ({ getRequest: () => ({ user: { role: 'student' } }) }),
  } as any;

  it('enforces controller-level roles when a route has none of its own', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['teacher']),
    } as any;

    expect(new RolesGuard(reflector).canActivate(context)).toBe(false);
  });
});
