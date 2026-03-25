const express = require("express");

function createIntegrationRouter({ queueService, sendService }) {
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

  return router;
}

module.exports = { createIntegrationRouter };
