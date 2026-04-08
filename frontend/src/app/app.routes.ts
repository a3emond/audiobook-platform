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
		loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
	},
	{
		path: 'register',
		loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
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
		loadComponent: () => import('./features/player/player.page').then((m) => m.PlayerPage),
	},
	{
		path: 'history',
		canActivate: [authGuard],
		loadComponent: () => import('./features/history/history.page').then((m) => m.HistoryPage),
	},
	{
		path: 'stats',
		canActivate: [authGuard],
		loadComponent: () => import('./features/stats/stats-page/stats-page.component').then((m) => m.StatsPageComponent),
	},
	{
		path: 'settings',
		canActivate: [authGuard],
		loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
	},
	{
		path: 'admin/overview',
		canActivate: [adminGuard],
		loadComponent: () => import('./features/admin/admin-overview.page').then((m) => m.AdminOverviewPage),
	},
	{
		path: 'admin/upload',
		canActivate: [adminGuard],
		loadComponent: () => import('./features/admin/admin-upload.page').then((m) => m.AdminUploadPage),
	},
	{
		path: 'admin/books',
		canActivate: [adminGuard],
		loadComponent: () => import('./features/admin/admin-books.page').then((m) => m.AdminBooksPage),
	},
	{
		path: 'admin/users',
		canActivate: [adminGuard],
		loadComponent: () => import('./features/admin/admin-users.page').then((m) => m.AdminUsersPage),
	},
	{
		path: 'admin/books/:bookId',
		canActivate: [adminGuard],
		loadComponent: () => import('./features/admin/admin-edit.page').then((m) => m.AdminEditPage),
	},
	{
		path: 'admin/jobs',
		canActivate: [adminGuard],
		loadComponent: () => import('./features/admin/admin-jobs.page').then((m) => m.AdminJobsPage),
	},
	{
		path: '**',
		redirectTo: 'library',
	},
];
