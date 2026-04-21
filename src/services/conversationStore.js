const PARTITION_KEY = "teams";

function buildRowKey(prefix, value) {
  return `${prefix}:${encodeURIComponent(value)}`;
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function createConversationStore(tableClient) {
  if (!tableClient) {
    throw new Error("tableClient is required");
  }

  async function ensureConversationTableExists() {
    try {
      await tableClient.createTable();
    } catch (error) {
      if (error.statusCode !== 409) {
        throw error;
      }
    }
  }

  async function saveConversationReference(reference, target = null) {
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
        target: target || null,
        reference: serialized,
      },
    ];

    if (target) {
      entries.push({
        partitionKey: PARTITION_KEY,
        rowKey: buildRowKey("target", target),
        conversationId,
        target,
        reference: serialized,
      });
    }

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

  async function getReferenceByTarget(target) {
    if (!target) {
      return null;
    }

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

  async function saveReferenceByEmail(reference, email) {
    const conversationId = reference?.conversation?.id;
    const normalizedEmail = normalizeEmail(email);
    if (!conversationId || !normalizedEmail) {
      return;
    }

    await tableClient.upsertEntity(
      {
        partitionKey: PARTITION_KEY,
        rowKey: buildRowKey("email", normalizedEmail),
        conversationId,
        email: normalizedEmail,
        target: null,
        reference: JSON.stringify(reference),
      },
      "Replace",
    );
  }

  async function getReferenceByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return null;
    }

    try {
      const entity = await tableClient.getEntity(
        PARTITION_KEY,
        buildRowKey("email", normalizedEmail),
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
    saveReferenceByEmail,
    getReferenceByEmail,
  };
}

module.exports = { createConversationStore };
