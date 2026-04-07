import { Router } from "express";

import { StreamingController } from "./stream.controller.js";
import { validateRangeHeader } from "./stream.validation.js";

const router = Router();

router.get("/books/:bookId/resume", StreamingController.getResumeInfo);
router.head("/books/:bookId/audio", StreamingController.getBookAudioHead);
router.get("/books/:bookId/audio", validateRangeHeader, StreamingController.streamBookAudio);

export default router;