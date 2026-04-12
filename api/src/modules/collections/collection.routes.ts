/**
 * Route registration for user-managed book collections and library organization.
 * This is where middleware order becomes explicit: auth, role checks,
 * validation, and controller binding are composed here so the external HTTP
 * surface stays readable and reviewable.
 */
import { Router } from "express";

import { CollectionController } from "./collection.controller.js";

const router = Router();

router.get("/", CollectionController.listCollections);
router.post("/", CollectionController.createCollection);
router.get("/:collectionId", CollectionController.getCollection);
router.patch("/:collectionId", CollectionController.updateCollection);
router.delete("/:collectionId", CollectionController.deleteCollection);

export default router;
