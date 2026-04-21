const express = require("express");

function createIntegrationRouter({
  queueService,
  sendService,
  bindService,
  conversationStore,
}) {
  const router = express.Router();

  router.get("/updates", async (req, res, next) => {
    try {
      const updates = await queueService.getUpdates(req.query.max);
      res.json({ updates });
    } catch (error) {
      next(error);
    }
  });

  router.post("/ack", async (req, res, next) => {
    try {
      const { updateId, popReceipt } = req.body || {};
      if (!updateId || !popReceipt) {
        return res
          .status(400)
          .json({ error: "`updateId` and `popReceipt` are required." });
      }

      await queueService.ackUpdate(updateId, popReceipt);
      return res.json({ status: "acknowledged", updateId });
    } catch (error) {
      next(error);
    }
  });

  router.post("/send", async (req, res, next) => {
    try {
      const result = await sendService.proactiveSend(req.body || {});
      return res.json(result);
    } catch (error) {
      if (Number.isInteger(error.statusCode)) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      return next(error);
    }
  });

  router.post("/link/start", async (req, res, next) => {
    try {
      const { email } = req.body || {};
      if (!(typeof email === "string" && email.trim())) {
        return res.status(400).json({ error: "`email` is required." });
      }
      const result = await bindService.start(email);
      return res.json({
        email: result.email,
        bindToken: result.bindToken,
        expiresAt: result.expiresAt,
        instructions: `Open the bot in Teams and send: LINK ${result.bindToken}`,
      });
    } catch (error) {
      if (Number.isInteger(error.statusCode)) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      return next(error);
    }
  });

  router.get("/conversation/by-email", async (req, res, next) => {
    try {
      const email = req.query?.email;
      if (!(typeof email === "string" && email.trim())) {
        return res.status(400).json({ error: "`email` query parameter is required." });
      }

      const reference = await conversationStore.getReferenceByEmail(email);
      if (!reference) {
        return res.status(404).json({ error: "Conversation reference was not found." });
      }

      return res.json({
        email: email.trim().toLowerCase(),
        conversationId: reference.conversation?.id || null,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createIntegrationRouter };
