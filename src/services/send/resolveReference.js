const { SendError } = require("./errors");

async function resolveReference(
  { conversationId, target },
  {
    getReferenceByConversationId,
    getReferenceByTarget,
    defaultTarget = "default",
  },
) {
  if (conversationId) {
    const byConversationId = await getReferenceByConversationId(conversationId);
    if (!byConversationId) {
      throw new SendError("Conversation reference was not found.", 404);
    }
    return byConversationId;
  }

  const resolvedTarget = target || defaultTarget;
  const byTarget = await getReferenceByTarget(resolvedTarget);
  if (!byTarget) {
    throw new SendError("Target reference was not found.", 404);
  }

  return byTarget;
}

module.exports = { resolveReference };
