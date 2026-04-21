const { SendError } = require("./errors");

async function resolveReference(
  { conversationId, target },
  { getReferenceByConversationId, getReferenceByTarget },
) {
  if (conversationId) {
    const byConversationId = await getReferenceByConversationId(conversationId);
    if (!byConversationId) {
      throw new SendError("Conversation reference was not found.", 404);
    }
    return byConversationId;
  }

  if (!target) {
    throw new SendError("Either `conversationId` or `target` is required.", 400);
  }

  const byTarget = await getReferenceByTarget(target);
  if (!byTarget) {
    throw new SendError("Target reference was not found.", 404);
  }

  return byTarget;
}

module.exports = { resolveReference };
