const test = require("node:test");
const assert = require("node:assert/strict");
const { createBot } = require("../../src/bot/bot");
const {
  mapTenantId,
  createUpdate,
  formatActionConfirmation,
} = require("../../src/bot/updateMapper");

test("mapTenantId resolves tenant from conversation or channelData", () => {
  assert.equal(
    mapTenantId({ conversation: { tenantId: "tenant-conversation" } }),
    "tenant-conversation",
  );
  assert.equal(
    mapTenantId({ channelData: { tenant: { id: "tenant-channel-data" } } }),
    "tenant-channel-data",
  );
  assert.equal(mapTenantId({}), null);
});

test("createUpdate maps activity fields into queue payload", () => {
  const payload = createUpdate(
    {
      id: "a1",
      from: { id: "u1", name: "Ihor" },
      conversation: { id: "c1", tenantId: "t1" },
    },
    "card.submit",
    { action: "approve" },
  );

  assert.equal(payload.type, "card.submit");
  assert.equal(payload.activityId, "a1");
  assert.equal(payload.from.id, "u1");
  assert.equal(payload.from.name, "Ihor");
  assert.equal(payload.tenantId, "t1");
  assert.equal(payload.conversationId, "c1");
  assert.deepEqual(payload.data, { action: "approve" });
});

test("formatActionConfirmation renders action specific and fallback texts", () => {
  assert.equal(formatActionConfirmation({ action: "approve" }), "✅ Обрано: approve");
  assert.equal(
    formatActionConfirmation({}),
    "✅ Вашу відповідь зафіксовано.",
  );
});

test("bot onInvokeActivity enqueues adaptive card execute updates", async () => {
  const updates = [];
  const bot = createBot({
    enqueueUpdate: async (update) => updates.push(update),
    saveConversationReference: async () => {},
  });

  const response = await bot.onInvokeActivity({
    activity: {
      id: "invoke-1",
      name: "adaptiveCard/action",
      from: { id: "u1", name: "Ihor" },
      conversation: { id: "c1" },
      value: { action: { data: { action: "approve", requestId: "R1" } } },
    },
  });

  assert.deepEqual(response, { status: 200 });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].type, "card.execute");
  assert.deepEqual(updates[0].data, { action: "approve", requestId: "R1" });
});
