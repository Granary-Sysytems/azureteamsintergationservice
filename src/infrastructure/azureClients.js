const { QueueServiceClient } = require("@azure/storage-queue");
const { TableClient } = require("@azure/data-tables");
const { createFileAttachmentService } = require("../services/fileAttachmentService");

function createAzureClients({
  storageConnectionString,
  queueName,
  tableName,
}) {
  const queueServiceClient = QueueServiceClient.fromConnectionString(
    storageConnectionString,
  );
  const queueClient = queueServiceClient.getQueueClient(queueName);

  const tableClient = TableClient.fromConnectionString(
    storageConnectionString,
    tableName,
  );

  const fileAttachmentService = createFileAttachmentService({
    storageConnectionString,
  });

  return {
    queueClient,
    tableClient,
    fileAttachmentService,
  };
}

module.exports = { createAzureClients };
