/**
 * Route registration for series-level catalog browsing and grouping.
 * This is where middleware order becomes explicit: auth, role checks,
 * validation, and controller binding are composed here so the external HTTP
 * surface stays readable and reviewable.
 */
import { Router } from "express";

import { SeriesController } from "./series.controller.js";

const router = Router();

router.get("/", SeriesController.listSeries);
router.get("/:seriesName", SeriesController.getSeries);

export default router;