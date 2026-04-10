import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
	{
		path: '',
		pathMatch: 'full',
		redirectTo: 'library',
	},
	{
		path: 'login',
		loadComponent: () => import('./features/auth/login-page/login.page').then((m) => m.LoginPage),
	},
	{
		path: 'register',
		loadComponent: () => import('./features/auth/register-page/register.page').then((m) => m.RegisterPage),
	},
	{
		path: 'privacy',
		loadComponent: () => import('./features/legal/privacy-page/privacy.page').then((m) => m.PrivacyPage),
	},
	{
		path: 'terms',
		loadComponent: () => import('./features/legal/terms-page/terms.page').then((m) => m.TermsPage),
	},
	{
		path: 'library',
		canActivate: [authGuard],
		loadComponent: () => import('./features/library/library-page/library-page.component').then((m) => m.LibraryPageComponent),
	},
	{
		path: 'series/:seriesName',
		canActivate: [authGuard],
		loadComponent: () => import('./features/library/series-detail-page/series-detail-page.component').then((m) => m.SeriesDetailPageComponent),
	},
	{
		path: 'collections/:collectionId',
		canActivate: [authGuard],
		loadComponent: () => import('./features/library/collection-detail-page/collection-detail-page.component').then((m) => m.CollectionDetailPageComponent),
	},
	{
		path: 'player/:bookId',
		canActivate: [authGuard],
		loadComponent: () => import('./features/player/player-page/player.page').then((m) => m.PlayerPage),
	},
	{
		path: 'profile',
		canActivate: [authGuard],
		loadComponent: () => import('./features/profile/profile-page/profile.page').then((m) => m.ProfilePage),
	},
	{
		path: 'discussions',
		canActivate: [authGuard],
		loadComponent: () => import('./features/discussions/discussions-redirect-page/discussions-redirect.page').then((m) => m.DiscussionsRedirectPage),
	},
	{
		path: 'discussions/:lang',
		canActivate: [authGuard],
		loadComponent: () => import('./features/discussions/discussions-page/discussions.page').then((m) => m.DiscussionsPage),
	},
	{
		path: 'admin',
		canActivate: [adminGuard],
		loadComponent: () =>
			import('./features/admin/admin-shell/admin-shell.component').then((m) => m.AdminShellComponent),
		loadChildren: () =>
			import('./features/admin/admin.routes').then((m) => m.adminRoutes),
	},
	{
		path: '**',
		redirectTo: 'library',
	},
];
