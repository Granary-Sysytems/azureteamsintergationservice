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
