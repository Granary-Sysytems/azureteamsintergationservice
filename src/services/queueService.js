function createQueueService(queueClient) {
  if (!queueClient) {
    throw new Error("queueClient is required");
  }

  async function ensureQueueExists() {
    await queueClient.createIfNotExists();
  }

  async function enqueueUpdate(update) {
    const payload = JSON.stringify(update);
    const result = await queueClient.sendMessage(payload);
    return result.messageId;
  }

  async function getUpdates(max = 10) {
    const boundedMax = Math.max(1, Math.min(Number(max) || 10, 32));
    const messages = await queueClient.receiveMessages({
      numberOfMessages: boundedMax,
      visibilityTimeout: 15,
    });

    return (messages.receivedMessageItems || []).map((message) => {
      let payload = {};

      try {
        payload = JSON.parse(message.messageText || "{}");
      } catch (error) {
        payload = { raw: message.messageText, parseError: true };
      }

      return {
        updateId: message.messageId,
        popReceipt: message.popReceipt,
        ...payload,
      };
    });
  }

  async function ackUpdate(updateId, popReceipt) {
    await queueClient.deleteMessage(updateId, popReceipt);
  }

  return {
    ensureQueueExists,
    enqueueUpdate,
    getUpdates,
    ackUpdate,
  };
}

module.exports = { createQueueService };
