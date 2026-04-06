import { Router } from "express";
import { JobController } from "./job.controller.js";

const router = Router();

// Enqueue a new job
router.post("/enqueue", JobController.enqueueJob);

// Get stats
router.get("/stats", JobController.getStats);

// List jobs with filtering
router.get("/", JobController.listJobs);

// Get specific job status
router.get("/:jobId", JobController.getJob);

// Cancel a queued job
router.delete("/:jobId", JobController.cancelJob);

export default router;
