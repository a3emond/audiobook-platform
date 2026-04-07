import { Router } from "express";

import { BookController } from "./book.controller.js";

const router = Router();

router.get("/", BookController.listBooks);
router.get("/:bookId", BookController.getBook);

export default router;
