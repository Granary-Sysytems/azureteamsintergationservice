const { getConfig } = require("./config/env");
const { createQueueService } = require("./services/queueService");
const { createConversationStore } = require("./services/conversationStore");
const { createAdapter, createBot } = require("./bot/bot");
const { createSendService } = require("./services/sendService");
const { createAzureClients } = require("./infrastructure/azureClients");

function createAppContext() {
  const config = getConfig();

  const { queueClient, tableClient, fileAttachmentService } = createAzureClients({
    storageConnectionString: config.storageConnectionString,
    queueName: config.queueName,
    tableName: config.tableName,
  });

  const queueService = createQueueService(queueClient);
  const conversationStore = createConversationStore(tableClient, {
    defaultTarget: config.defaultTarget,
  });

  const adapter = createAdapter({
    botAppId: config.botAppId,
    botAppPassword: config.botAppPassword,
    botAppTenantId: config.botAppTenantId,
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
    uploadTextFile: fileAttachmentService.uploadTextFile,
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
