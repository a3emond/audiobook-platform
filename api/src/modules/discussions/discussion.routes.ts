/**
 * Route registration for community discussion channels and threaded messages.
 * This is where middleware order becomes explicit: auth, role checks,
 * validation, and controller binding are composed here so the external HTTP
 * surface stays readable and reviewable.
 */
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
