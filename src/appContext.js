const { QueueServiceClient } = require("@azure/storage-queue");
const { TableClient } = require("@azure/data-tables");
const { getConfig } = require("./config/env");
const { createQueueService } = require("./services/queueService");
const { createConversationStore } = require("./services/conversationStore");
const { createAdapter, createBot } = require("./bot/bot");
const { createSendService } = require("./services/sendService");

function createAppContext() {
  const config = getConfig();

  const queueServiceClient = QueueServiceClient.fromConnectionString(
    config.storageConnectionString,
  );
  const queueClient = queueServiceClient.getQueueClient(config.queueName);
  const queueService = createQueueService(queueClient);

  const tableClient = TableClient.fromConnectionString(
    config.storageConnectionString,
    config.tableName,
  );
  const conversationStore = createConversationStore(tableClient, {
    defaultTarget: config.defaultTarget,
  });

  const adapter = createAdapter({
    botAppId: config.botAppId,
    botAppPassword: config.botAppPassword,
  });

  const bot = createBot({
    enqueueUpdate: queueService.enqueueUpdate,
    saveConversationReference: conversationStore.saveConversationReference,
  });

  const sendService = createSendService({
    adapter,
    getReferenceByConversationId: conversationStore.getReferenceByConversationId,
    getReferenceByTarget: conversationStore.getReferenceByTarget,
    defaultTarget: config.defaultTarget,
  });

  return {
    config,
    queueService,
    conversationStore,
    adapter,
    bot,
    sendService,
  };
}

module.exports = { createAppContext };
