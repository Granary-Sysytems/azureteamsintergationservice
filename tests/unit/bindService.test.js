const test = require("node:test");
const assert = require("node:assert/strict");
const { createBindService, BindError } = require("../../src/services/bindService");

test("start creates one-time token with normalized email", async () => {
  const upserts = [];
  const service = createBindService({
    tableClient: {
      upsertEntity: async (entity, mode) => upserts.push({ entity, mode }),
      getEntity: async () => {
        throw new Error("not used");
      },
    },
    randomBytes: () => Buffer.from("abc"),
    now: () => Date.UTC(2026, 0, 1, 10, 0, 0),
  });

  const result = await service.start("Ihor.Neshyk@Ukroliya.com ");
  assert.equal(result.email, "ihor.neshyk@ukroliya.com");
  assert.equal(result.bindToken, "YWJj");
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].mode, "Replace");
  assert.equal(upserts[0].entity.rowKey, "bindToken:YWJj");
});

test("start rejects invalid email", async () => {
  const service = createBindService({
    tableClient: { upsertEntity: async () => {}, getEntity: async () => ({}) },
  });
  await assert.rejects(
    () => service.start("not-email"),
    (error) => error instanceof BindError && error.statusCode === 400,
  );
});

test("consume marks valid token as used", async () => {
  const upserts = [];
  const service = createBindService({
    tableClient: {
      upsertEntity: async (entity, mode) => upserts.push({ entity, mode }),
      getEntity: async () => ({
        partitionKey: "teams",
        rowKey: "bindToken:token1",
        email: "user@example.com",
        expiresAt: "2026-01-01T11:00:00.000Z",
        usedAt: "",
      }),
    },
    now: () => Date.parse("2026-01-01T10:00:00.000Z"),
  });

  const result = await service.consume("token1");
  assert.deepEqual(result, { ok: true, email: "user@example.com" });
  assert.equal(upserts.length, 1);
  assert.match(upserts[0].entity.usedAt, /2026-01-01T10:00:00/);
});

test("consume returns used/expired/not_found states", async () => {
  const usedService = createBindService({
    tableClient: {
      upsertEntity: async () => {},
      getEntity: async () => ({
        email: "user@example.com",
        expiresAt: "2026-01-01T11:00:00.000Z",
        usedAt: "2026-01-01T10:00:00.000Z",
      }),
    },
  });
  assert.deepEqual(await usedService.consume("token"), {
    ok: false,
    reason: "used",
    email: "user@example.com",
  });

  const expiredService = createBindService({
    tableClient: {
      upsertEntity: async () => {},
      getEntity: async () => ({
        email: "user@example.com",
        expiresAt: "2026-01-01T10:00:00.000Z",
        usedAt: "",
      }),
    },
    now: () => Date.parse("2026-01-01T10:00:01.000Z"),
  });
  assert.deepEqual(await expiredService.consume("token"), {
    ok: false,
    reason: "expired",
    email: "user@example.com",
  });

  const missingService = createBindService({
    tableClient: {
      upsertEntity: async () => {},
      getEntity: async () => {
        const error = new Error("not found");
        error.statusCode = 404;
        throw error;
      },
    },
  });
  assert.deepEqual(await missingService.consume("token"), {
    ok: false,
    reason: "not_found",
  });
});
