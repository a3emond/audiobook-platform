import { Router } from "express";

import { DiscussionController } from "./discussion.controller.js";

const router = Router();

router.get("/channels", DiscussionController.listChannels);
router.get("/:lang/:channelKey/messages", DiscussionController.listMessages);
router.post("/:lang/:channelKey/messages", DiscussionController.postMessage);

export default router;
