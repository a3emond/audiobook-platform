import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
	{
		path: '',
		redirectTo: 'overview',
		pathMatch: 'full',
	},
	{
		path: 'overview',
		loadComponent: () => import('./admin-overview-page/admin-overview.page').then((m) => m.AdminOverviewPage),
	},
	{
		path: 'books',
		loadComponent: () => import('./admin-books-page/admin-books.page').then((m) => m.AdminBooksPage),
	},
	{
		path: 'books/:bookId',
		loadComponent: () => import('./admin-edit-page/admin-edit.page').then((m) => m.AdminEditPage),
	},
	{
		path: 'upload',
		loadComponent: () => import('./admin-upload-page/admin-upload.page').then((m) => m.AdminUploadPage),
	},
	{
		path: 'users',
		loadComponent: () => import('./admin-users-page/admin-users.page').then((m) => m.AdminUsersPage),
	},
	{
		path: 'jobs',
		loadComponent: () => import('./admin-jobs-page/admin-jobs.page').then((m) => m.AdminJobsPage),
	},
];
