/**
 * Core business logic for admin-only book operations, user management, audit visibility, and worker controls.
 * In this codebase, services are the place where models, validation results,
 * worker/job coordination, and cross-feature rules come together so controllers
 * remain small and the domain behavior stays testable and reusable.
 */
import { BookModel } from "../books/book.model.js";
import { CollectionModel } from "../collections/collection.model.js";
import { JobModel } from "../jobs/job.model.js";
import { UserModel } from "../users/user.model.js";

export interface AdminOverviewDTO {
	counts: {
		users: number;
		books: number;
		collections: number;
		jobs: number;
	};
	jobsByStatus: {
		queued: number;
		running: number;
		retrying: number;
		done: number;
		failed: number;
	};
}

export interface AdminCoverageItemDTO {
	method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
	path: string;
	area: "books" | "jobs" | "platform" | "users";
	description: string;
}

export interface AdminCoverageDTO {
	adminOnlyEndpoints: AdminCoverageItemDTO[];
	notes: string[];
}

export class AdminService {
	static async getOverview(): Promise<AdminOverviewDTO> {
		const [users, books, collections, jobs, queued, running, retrying, done, failed] =
			await Promise.all([
				UserModel.countDocuments(),
				BookModel.countDocuments(),
				CollectionModel.countDocuments(),
				JobModel.countDocuments(),
				JobModel.countDocuments({ status: "queued" }),
				JobModel.countDocuments({ status: "running" }),
				JobModel.countDocuments({ status: "retrying" }),
				JobModel.countDocuments({ status: "done" }),
				JobModel.countDocuments({ status: "failed" }),
			]);

		return {
			counts: {
				users,
				books,
				collections,
				jobs,
			},
			jobsByStatus: {
				queued,
				running,
				retrying,
				done,
				failed,
			},
		};
	}

	static getCoverage(): AdminCoverageDTO {
		return {
			adminOnlyEndpoints: [
				{
					method: "GET",
					path: "/api/admin/overview",
					area: "platform",
					description: "Dashboard summary counters and job status totals",
				},
				{
					method: "GET",
					path: "/api/admin/coverage",
					area: "platform",
					description: "Authoritative list of admin-managed endpoints",
				},
				{
					method: "POST",
					path: "/api/admin/books/upload",
					area: "books",
					description: "Upload audiobook file and enqueue ingest",
				},
				{
					method: "POST",
					path: "/api/admin/books/upload/mp3",
					area: "books",
					description: "Upload MP3 + metadata + optional cover and enqueue M4B build",
				},
				{
					method: "GET",
					path: "/api/admin/books",
					area: "books",
					description: "List books for admin dashboard workflows",
				},
				{
					method: "GET",
					path: "/api/admin/books/:bookId",
					area: "books",
					description: "Read one book for admin editing flows",
				},
				{
					method: "PATCH",
					path: "/api/admin/books/:bookId/metadata",
					area: "books",
					description: "Update editable book metadata",
				},
				{
					method: "PATCH",
					path: "/api/admin/books/:bookId/chapters",
					area: "books",
					description: "Replace chapters and enqueue metadata write",
				},
				{
					method: "POST",
					path: "/api/admin/books/:bookId/extract-cover",
					area: "books",
					description: "Queue cover extraction",
				},
				{
					method: "POST",
					path: "/api/admin/books/:bookId/cover",
					area: "books",
					description: "Upload and queue embedded cover replacement",
				},
				{
					method: "DELETE",
					path: "/api/admin/books/:bookId",
					area: "books",
					description: "Queue full book deletion",
				},
				{
					method: "GET",
					path: "/api/admin/users",
					area: "users",
					description: "List users with search, role filter, and pagination",
				},
				{
					method: "GET",
					path: "/api/admin/users/:userId",
					area: "users",
					description: "Read a specific user",
				},
				{
					method: "PATCH",
					path: "/api/admin/users/:userId/role",
					area: "users",
					description: "Change user role with safeguards",
				},
				{
					method: "GET",
					path: "/api/admin/users/:userId/sessions",
					area: "users",
					description: "List refresh-token sessions for a user",
				},
				{
					method: "DELETE",
					path: "/api/admin/users/:userId/sessions",
					area: "users",
					description: "Revoke all refresh-token sessions for a user",
				},
				{
					method: "POST",
					path: "/api/admin/jobs/enqueue",
					area: "jobs",
					description: "Queue any supported background job",
				},
				{
					method: "POST",
					path: "/api/admin/jobs/remediate-cover-overrides",
					area: "jobs",
					description: "Force rescan and remediate admin cover overrides on existing content",
				},
				{
					method: "GET",
					path: "/api/admin/jobs/stats",
					area: "jobs",
					description: "Job queue status counters",
				},
				{
					method: "GET",
					path: "/api/admin/jobs",
					area: "jobs",
					description: "Paginated job listing with filters",
				},
				{
					method: "GET",
					path: "/api/admin/jobs/:jobId",
					area: "jobs",
					description: "Inspect a specific job",
				},
				{
					method: "DELETE",
					path: "/api/admin/jobs/:jobId",
					area: "jobs",
					description: "Cancel a queued job",
				},
			],
			notes: [
				"All /api/admin endpoints require authenticated admin role.",
				"Consumer APIs remain under /api/books, /api/series, /api/progress, /api/settings, /api/collections.",
			],
		};
	}
}
