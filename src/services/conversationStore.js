const PARTITION_KEY = "teams";

function buildRowKey(prefix, value) {
  return `${prefix}:${encodeURIComponent(value)}`;
}

function createConversationStore(tableClient, options = {}) {
  if (!tableClient) {
    throw new Error("tableClient is required");
  }

  const defaultTarget = options.defaultTarget || "default";

  async function ensureConversationTableExists() {
    try {
      await tableClient.createTable();
    } catch (error) {
      if (error.statusCode !== 409) {
        throw error;
      }
    }
  }

  async function saveConversationReference(reference, target = defaultTarget) {
    const conversationId = reference.conversation && reference.conversation.id;

    if (!conversationId) {
      return;
    }

    const serialized = JSON.stringify(reference);
    const entries = [
      {
        partitionKey: PARTITION_KEY,
        rowKey: buildRowKey("conversationId", conversationId),
        conversationId,
        target,
        reference: serialized,
      },
      {
        partitionKey: PARTITION_KEY,
        rowKey: buildRowKey("target", target),
        conversationId,
        target,
        reference: serialized,
      },
    ];

    await Promise.all(
      entries.map((entity) => tableClient.upsertEntity(entity, "Replace")),
    );
  }

  async function getReferenceByConversationId(conversationId) {
    try {
      const entity = await tableClient.getEntity(
        PARTITION_KEY,
        buildRowKey("conversationId", conversationId),
      );
      return JSON.parse(entity.reference);
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async function getReferenceByTarget(target = defaultTarget) {
    try {
      const entity = await tableClient.getEntity(
        PARTITION_KEY,
        buildRowKey("target", target),
      );
      return JSON.parse(entity.reference);
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  return {
    ensureConversationTableExists,
    saveConversationReference,
    getReferenceByConversationId,
    getReferenceByTarget,
  };
}

module.exports = { createConversationStore };
