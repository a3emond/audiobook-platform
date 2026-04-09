import { Router } from "express";

import { DiscussionController } from "./discussion.controller.js";

const router = Router();

router.get("/channels", DiscussionController.listChannels);
router.post("/channels", DiscussionController.createChannelByAdmin);
router.delete("/:lang/:channelKey", DiscussionController.deleteChannelByAdmin);
router.get("/:lang/:channelKey/messages", DiscussionController.listMessages);
router.post("/:lang/:channelKey/messages", DiscussionController.postMessage);
router.delete(
	"/:lang/:channelKey/messages/:messageId",
	DiscussionController.deleteMessageByAdmin,
);

export default router;
