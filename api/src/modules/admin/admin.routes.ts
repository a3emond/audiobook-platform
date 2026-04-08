import { Router } from "express";
import multer from "multer";

import { idempotencyMiddleware } from "../../middlewares/idempotency.middleware.js";
import { BookController } from "../books/book.controller.js";
import { JobController } from "../jobs/job.controller.js";
import { UserController } from "../users/user.controller.js";
import { AdminController } from "./admin.controller.js";
import { adminAuditMiddleware } from "./admin-audit.middleware.js";

const MAX_UPLOAD_BYTES = Number(process.env.UPLOAD_MAX_FILE_SIZE_BYTES || 2 * 1024 * 1024 * 1024);

const router = Router();
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: MAX_UPLOAD_BYTES,
	},
});

router.use(adminAuditMiddleware);

router.get("/overview", AdminController.getOverview);
router.get("/coverage", AdminController.getCoverage);
router.post("/books/upload", upload.single("file"), AdminController.uploadBook);
router.post(
	"/books/upload/mp3",
	upload.fields([
		{ name: "file", maxCount: 1 },
		{ name: "cover", maxCount: 1 },
	]),
	AdminController.uploadMp3Book,
);
router.post("/books/:bookId/cover", upload.single("cover"), AdminController.replaceBookCover);

router.get("/books", BookController.listBooks);
router.get("/books/:bookId", BookController.getBook);
router.patch("/books/:bookId/metadata", BookController.updateMetadata);
router.patch("/books/:bookId/chapters", BookController.updateChapters);
router.post("/books/:bookId/extract-cover", BookController.extractCover);
router.delete("/books/:bookId", BookController.deleteBook);

router.post("/jobs/enqueue", idempotencyMiddleware, JobController.enqueueJob);
router.get("/jobs/stats", JobController.getStats);
router.get("/jobs", JobController.listJobs);
router.get("/jobs/events", JobController.streamJobEvents);
router.get("/jobs/:jobId", JobController.getJob);
router.delete("/jobs/:jobId", JobController.cancelJob);

router.get("/users", UserController.listUsers);
router.get("/users/:userId", UserController.getUser);
router.patch("/users/:userId/role", UserController.updateUserRole);
router.get("/users/:userId/sessions", UserController.listUserSessions);
router.delete("/users/:userId/sessions", UserController.revokeUserSessions);

export default router;
