const express = require("express");
const { createBearerAuth } = require("./middleware/auth");
const { createMessagesRouter } = require("./routes/messages");
const { createIntegrationRouter } = require("./routes/integration");

function createApp({ adapter, bot, queueService, sendService, bearerToken }) {
  const app = express();

  app.use(express.json({ limit: "512kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", createMessagesRouter({ adapter, bot }));
  app.use(
    "/",
    createBearerAuth(bearerToken),
    createIntegrationRouter({ queueService, sendService }),
  );

  app.use((error, _req, res, _next) => {
    console.error("Unhandled error:", error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

async function bootstrap(deps) {
  await deps.queueService.ensureQueueExists();
  await deps.conversationStore.ensureConversationTableExists();

  const app = createApp({
    adapter: deps.adapter,
    bot: deps.bot,
    queueService: deps.queueService,
    sendService: deps.sendService,
    bearerToken: deps.config.apiBearerToken,
  });

  return new Promise((resolve) => {
    const server = app.listen(deps.config.port, () => {
      console.log(`Server listening on port ${deps.config.port}`);
      resolve(server);
    });
  });
}

module.exports = { createApp, bootstrap };
