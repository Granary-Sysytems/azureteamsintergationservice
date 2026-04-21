const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../../src/server");

function createTestContext(overrides = {}) {
  const calls = {
    getUpdates: [],
    ackUpdate: [],
    proactiveSend: [],
    bindStart: [],
    getReferenceByEmail: [],
    processActivity: 0,
    botRun: 0,
  };

  const queueService = {
    getUpdates: async (max) => {
      calls.getUpdates.push(max);
      return [{ updateId: "u-1", popReceipt: "p-1" }];
    },
    ackUpdate: async (updateId, popReceipt) => {
      calls.ackUpdate.push({ updateId, popReceipt });
    },
  };
  const sendService = {
    proactiveSend: async (payload) => {
      calls.proactiveSend.push(payload);
      return { status: "sent", conversationId: "conv-1" };
    },
  };
  const adapter = {
    processActivity: async (_req, res, callback) => {
      calls.processActivity += 1;
      await callback({ activity: {}, sendActivity: async () => ({}) });
      if (!res.headersSent) {
        res.status(200).end();
      }
    },
  };
  const bot = {
    run: async () => {
      calls.botRun += 1;
    },
  };
  const bindService = {
    start: async (email) => {
      calls.bindStart.push(email);
      return {
        email: String(email).trim().toLowerCase(),
        bindToken: "token-abc",
        expiresAt: "2026-01-01T00:00:00.000Z",
      };
    },
  };
  const conversationStore = {
    getReferenceByEmail: async (email) => {
      calls.getReferenceByEmail.push(email);
      return { conversation: { id: "conv-email-1" } };
    },
  };

  const app = createApp({
    adapter: overrides.adapter || adapter,
    bot: overrides.bot || bot,
    queueService: overrides.queueService || queueService,
    sendService: overrides.sendService || sendService,
    conversationStore: overrides.conversationStore || conversationStore,
    bindService: overrides.bindService || bindService,
    bearerToken: "token-123",
  });

  return {
    app,
    queueService,
    sendService,
    calls,
  };
}

async function withServer(run) {
  const context = createTestContext();
  const { app } = context;
  const server = await new Promise((resolve) => {
    const created = app.listen(0, () => resolve(created));
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run(baseUrl, context);
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

test("GET /updates returns updates and forwards max query", async () => {
  await withServer(async (baseUrl, context) => {
    const response = await fetch(`${baseUrl}/updates?max=7`, {
      headers: { Authorization: "Bearer token-123" },
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(json, { updates: [{ updateId: "u-1", popReceipt: "p-1" }] });
    assert.deepEqual(context.calls.getUpdates, ["7"]);
  });
});

test("POST /ack acknowledges update", async () => {
  await withServer(async (baseUrl, context) => {
    const response = await fetch(`${baseUrl}/ack`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ updateId: "id-1", popReceipt: "pr-1" }),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(json, { status: "acknowledged", updateId: "id-1" });
    assert.deepEqual(context.calls.ackUpdate, [
      { updateId: "id-1", popReceipt: "pr-1" },
    ]);
  });
});

test("POST /send returns send service success payload", async () => {
  await withServer(async (baseUrl, context) => {
    const body = {
      target: "default",
      text: "hello",
      base64File: {
        fileName: "doc.pdf",
        contentType: "application/pdf",
        base64Body: "dGVzdA==",
      },
    };
    const response = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(json, { status: "sent", conversationId: "conv-1" });
    assert.equal(context.calls.proactiveSend.length, 1);
    assert.deepEqual(context.calls.proactiveSend[0], body);
  });
});

test("POST /link/start returns bind token payload", async () => {
  await withServer(async (baseUrl, context) => {
    const response = await fetch(`${baseUrl}/link/start`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "IHOR.NESHYK@ukroliya.com" }),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.bindToken, "token-abc");
    assert.equal(context.calls.bindStart[0], "IHOR.NESHYK@ukroliya.com");
  });
});

test("GET /conversation/by-email resolves mapped conversationId", async () => {
  await withServer(async (baseUrl, context) => {
    const response = await fetch(
      `${baseUrl}/conversation/by-email?email=ihor.neshyk@ukroliya.com`,
      {
        headers: { Authorization: "Bearer token-123" },
      },
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(json, {
      email: "ihor.neshyk@ukroliya.com",
      conversationId: "conv-email-1",
    });
    assert.equal(context.calls.getReferenceByEmail.length, 1);
  });
});

test("POST /link/start validates email", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/link/start`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 400);
  });
});

test("GET /conversation/by-email returns 404 for unknown email", async () => {
  const app = createApp({
    adapter: { processActivity: async (_req, _res, cb) => cb({}) },
    bot: { run: async () => {} },
    queueService: { getUpdates: async () => [], ackUpdate: async () => {} },
    sendService: { proactiveSend: async () => ({ status: "sent" }) },
    conversationStore: { getReferenceByEmail: async () => null },
    bindService: { start: async () => ({}) },
    bearerToken: "token-123",
  });

  const server = await new Promise((resolve) => {
    const created = app.listen(0, () => resolve(created));
  });
  const port = server.address().port;

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/conversation/by-email?email=missing@example.com`,
      {
        headers: { Authorization: "Bearer token-123" },
      },
    );
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

test("POST /api/messages runs adapter and bot", async () => {
  await withServer(async (baseUrl, context) => {
    const response = await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "message", text: "hello" }),
    });

    assert.equal(response.status, 200);
    assert.equal(context.calls.processActivity, 1);
    assert.equal(context.calls.botRun, 1);
  });
});

test("POST /send returns service status errors", async () => {
  const app = createApp({
    adapter: { processActivity: async (_req, _res, cb) => cb({}) },
    bot: { run: async () => {} },
    queueService: { getUpdates: async () => [], ackUpdate: async () => {} },
    sendService: {
      proactiveSend: async () => {
        const error = new Error("Target reference was not found.");
        error.statusCode = 404;
        throw error;
      },
    },
    conversationStore: { getReferenceByEmail: async () => null },
    bindService: { start: async () => ({}) },
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

test("GET /updates returns 500 on unexpected errors", async () => {
  const app = createApp({
    adapter: { processActivity: async (_req, _res, cb) => cb({}) },
    bot: { run: async () => {} },
    queueService: {
      getUpdates: async () => {
        throw new Error("boom");
      },
      ackUpdate: async () => {},
    },
    sendService: { proactiveSend: async () => ({ status: "sent" }) },
    conversationStore: { getReferenceByEmail: async () => null },
    bindService: { start: async () => ({}) },
    bearerToken: "token-123",
  });

  const server = await new Promise((resolve) => {
    const created = app.listen(0, () => resolve(created));
  });
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/updates`, {
      headers: { Authorization: "Bearer token-123" },
    });
    const json = await response.json();
    assert.equal(response.status, 500);
    assert.deepEqual(json, { error: "Internal server error" });
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
