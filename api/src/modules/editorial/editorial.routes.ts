import { Router } from "express";

import { EditorialController } from "./editorial.controller.js";

const router = Router();

router.get("/blocks/active", EditorialController.listActiveBlocks);

export default router;
