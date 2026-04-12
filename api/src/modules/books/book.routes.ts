/**
 * Route registration for audiobook catalog reads and admin-side metadata maintenance.
 * This is where middleware order becomes explicit: auth, role checks,
 * validation, and controller binding are composed here so the external HTTP
 * surface stays readable and reviewable.
 */
import { Router } from "express";

import { BookController } from "./book.controller.js";

const router = Router();

router.get("/", BookController.listBooks);
router.get("/:bookId", BookController.getBook);

export default router;
