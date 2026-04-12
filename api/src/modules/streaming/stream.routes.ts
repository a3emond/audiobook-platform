/**
 * Route registration for authenticated audio and cover delivery plus resume metadata.
 * This is where middleware order becomes explicit: auth, role checks,
 * validation, and controller binding are composed here so the external HTTP
 * surface stays readable and reviewable.
 */
import { Router } from "express";

import { StreamingController } from "./stream.controller.js";
import { validateRangeHeader } from "./stream.validation.js";

const router = Router();

router.get("/books/:bookId/resume", StreamingController.getResumeInfo);
router.get("/books/:bookId/cover", StreamingController.getBookCover);
router.head("/books/:bookId/audio", StreamingController.getBookAudioHead);
router.get("/books/:bookId/audio", validateRangeHeader, StreamingController.streamBookAudio);

export default router;