const { QueueServiceClient } = require("@azure/storage-queue");
const { TableClient } = require("@azure/data-tables");
const { createFileAttachmentService } = require("../services/fileAttachmentService");

function createAzureClients({
  storageConnectionString,
  queueName,
  tableName,
  attachmentContainerName,
  attachmentAccessPolicyId,
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
    ...(attachmentContainerName ? { containerName: attachmentContainerName } : {}),
    ...(attachmentAccessPolicyId ? { accessPolicyId: attachmentAccessPolicyId } : {}),
  });

  return {
    queueClient,
    tableClient,
    fileAttachmentService,
  };
}

module.exports = { createAzureClients };
