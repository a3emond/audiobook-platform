import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (): boolean | UrlTree => {
	const auth = inject(AuthService);
	const router = inject(Router);

	return auth.isAuthenticated() ? true : router.parseUrl('/login');
};

export const adminGuard: CanActivateFn = (): boolean | UrlTree => {
	const auth = inject(AuthService);
	const router = inject(Router);

	if (!auth.isAuthenticated()) {
		return router.parseUrl('/login');
	}

	return auth.isAdmin() ? true : router.parseUrl('/library');
};
