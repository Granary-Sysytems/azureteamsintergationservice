const express = require("express");
function createMessagesRouter({ adapter, bot }) {
  const router = express.Router();

  router.post("/messages", async (req, res, next) => {
    try {
      await adapter.processActivity(req, res, async (turnContext) => {
        await bot.run(turnContext);
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createMessagesRouter };
