import { Router } from "express";

import { CollectionController } from "./collection.controller.js";

const router = Router();

router.get("/", CollectionController.listCollections);
router.post("/", CollectionController.createCollection);
router.get("/:collectionId", CollectionController.getCollection);
router.patch("/:collectionId", CollectionController.updateCollection);
router.delete("/:collectionId", CollectionController.deleteCollection);

export default router;
