const test = require("node:test");
const assert = require("node:assert/strict");
const { createQueueService } = require("../../src/services/queueService");

test("clamps max value for receiveMessages to Azure limit", async () => {
  const calls = [];
  const queueClient = {
    createIfNotExists: async () => {},
    sendMessage: async () => ({ messageId: "m1" }),
    receiveMessages: async (options) => {
      calls.push(options);
      return { receivedMessageItems: [] };
    },
    deleteMessage: async () => {},
  };
  const queueService = createQueueService(queueClient);

  await queueService.getUpdates(99);
  await queueService.getUpdates(0);

  assert.equal(calls[0].numberOfMessages, 32);
  assert.equal(calls[1].numberOfMessages, 10);
});

test("marks invalid json payload with parseError", async () => {
  const queueClient = {
    createIfNotExists: async () => {},
    sendMessage: async () => ({ messageId: "m1" }),
    receiveMessages: async () => ({
      receivedMessageItems: [
        {
          messageId: "id-1",
          popReceipt: "pr-1",
          messageText: "{not-json",
        },
      ],
    }),
    deleteMessage: async () => {},
  };
  const queueService = createQueueService(queueClient);

  const updates = await queueService.getUpdates(1);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].updateId, "id-1");
  assert.equal(updates[0].parseError, true);
});

test("ensureQueueExists delegates to createIfNotExists", async () => {
  let called = false;
  const queueClient = {
    createIfNotExists: async () => {
      called = true;
    },
    sendMessage: async () => ({ messageId: "m1" }),
    receiveMessages: async () => ({ receivedMessageItems: [] }),
    deleteMessage: async () => {},
  };
  const queueService = createQueueService(queueClient);

  await queueService.ensureQueueExists();
  assert.equal(called, true);
});

test("enqueueUpdate serializes payload and returns message id", async () => {
  let payload = null;
  const queueClient = {
    createIfNotExists: async () => {},
    sendMessage: async (value) => {
      payload = value;
      return { messageId: "message-42" };
    },
    receiveMessages: async () => ({ receivedMessageItems: [] }),
    deleteMessage: async () => {},
  };
  const queueService = createQueueService(queueClient);

  const messageId = await queueService.enqueueUpdate({ type: "card.submit", data: { x: 1 } });

  assert.equal(messageId, "message-42");
  assert.equal(payload, JSON.stringify({ type: "card.submit", data: { x: 1 } }));
});

test("ackUpdate delegates deleteMessage with update id and pop receipt", async () => {
  const calls = [];
  const queueClient = {
    createIfNotExists: async () => {},
    sendMessage: async () => ({ messageId: "m1" }),
    receiveMessages: async () => ({ receivedMessageItems: [] }),
    deleteMessage: async (updateId, popReceipt) => {
      calls.push({ updateId, popReceipt });
    },
  };
  const queueService = createQueueService(queueClient);

  await queueService.ackUpdate("id-77", "receipt-77");
  assert.deepEqual(calls, [{ updateId: "id-77", popReceipt: "receipt-77" }]);
});

test("getUpdates merges valid json payload with queue metadata", async () => {
  const queueClient = {
    createIfNotExists: async () => {},
    sendMessage: async () => ({ messageId: "m1" }),
    receiveMessages: async () => ({
      receivedMessageItems: [
        {
          messageId: "id-2",
          popReceipt: "pr-2",
          messageText: JSON.stringify({ type: "card.execute", data: { action: "approve" } }),
        },
      ],
    }),
    deleteMessage: async () => {},
  };
  const queueService = createQueueService(queueClient);

  const updates = await queueService.getUpdates(1);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    updateId: "id-2",
    popReceipt: "pr-2",
    type: "card.execute",
    data: { action: "approve" },
  });
});
