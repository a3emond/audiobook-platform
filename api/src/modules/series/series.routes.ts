import { Router } from "express";

import { SeriesController } from "./series.controller.js";

const router = Router();

router.get("/", SeriesController.listSeries);
router.get("/:seriesName", SeriesController.getSeries);

export default router;