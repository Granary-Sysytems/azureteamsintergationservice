const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../../src/server");

function createTestServer() {
  const queueService = {
    getUpdates: async () => [],
    ackUpdate: async () => {},
  };
  const sendService = {
    proactiveSend: async () => ({ status: "sent", conversationId: "conv-1" }),
  };
  const adapter = {
    processActivity: async (_req, _res, callback) => {
      await callback({ activity: {}, sendActivity: async () => ({}) });
    },
  };
  const bot = {
    run: async () => {},
  };

  const app = createApp({
    adapter,
    bot,
    queueService,
    sendService,
    bearerToken: "token-123",
  });

  return {
    app,
    queueService,
    sendService,
  };
}

async function withServer(run) {
  const { app } = createTestServer();
  const server = await new Promise((resolve) => {
    const created = app.listen(0, () => resolve(created));
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

test("GET /health returns ok", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(json, { status: "ok" });
  });
});

test("POST /ack requires auth and payload", async () => {
  await withServer(async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/ack`, { method: "POST" });
    assert.equal(unauthorized.status, 401);

    const badRequest = await fetch(`${baseUrl}/ack`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ updateId: "id-only" }),
    });
    assert.equal(badRequest.status, 400);
  });
});

test("POST /send returns service status errors", async () => {
  const queueService = { getUpdates: async () => [], ackUpdate: async () => {} };
  const sendService = {
    proactiveSend: async () => {
      const error = new Error("Target reference was not found.");
      error.statusCode = 404;
      throw error;
    },
  };
  const app = createApp({
    adapter: { processActivity: async (_req, _res, cb) => cb({}) },
    bot: { run: async () => {} },
    queueService,
    sendService,
    bearerToken: "token-123",
  });

  const server = await new Promise((resolve) => {
    const created = app.listen(0, () => resolve(created));
  });
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/send`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target: "missing-user", text: "hello" }),
    });

    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
