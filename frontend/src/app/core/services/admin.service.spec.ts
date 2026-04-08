import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AdminService } from './admin.service';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

describe('AdminService', () => {
  it('calls getOverview endpoint', async () => {
    const apiSpy = {
      get: vi.fn().mockReturnValue(
        of({
          counts: { users: 1, books: 2, collections: 3, jobs: 4 },
          jobsByStatus: { queued: 1, running: 1, retrying: 0, done: 1, failed: 1 },
        }),
      ),
    } as unknown as ApiService;

    const authStub = { accessToken: () => 'token' } as unknown as AuthService;
    const service = new AdminService(apiSpy, authStub);

    await firstValueFrom(service.getOverview());

    expect(apiSpy.get).toHaveBeenCalledWith('/admin/overview');
  });

  it('calls updateUserRole endpoint with payload', async () => {
    const apiSpy = {
      patch: vi.fn().mockReturnValue(
        of({
          id: 'u1',
          email: 'u@example.com',
          role: 'admin',
          profile: { displayName: null, preferredLocale: 'en' },
        }),
      ),
    } as unknown as ApiService;

    const authStub = { accessToken: () => 'token' } as unknown as AuthService;
    const service = new AdminService(apiSpy, authStub);

    await firstValueFrom(service.updateUserRole('u1', 'admin'));

    expect(apiSpy.patch).toHaveBeenCalledWith('/admin/users/u1/role', { role: 'admin' });
  });
});
