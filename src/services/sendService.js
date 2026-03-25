const { MessageFactory } = require("botbuilder");

class SendError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "SendError";
    this.statusCode = statusCode;
  }
}

function buildOutgoingActivity({ text, adaptiveCard }) {
  if (!text && !adaptiveCard) {
    throw new SendError("Request must include `text` or `adaptiveCard`.", 400);
  }

  if (adaptiveCard) {
    const attachment = {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: adaptiveCard,
    };
    return MessageFactory.attachment(attachment, text || undefined);
  }

  return MessageFactory.text(text);
}

function createSendService({
  adapter,
  getReferenceByConversationId,
  getReferenceByTarget,
  defaultTarget = "default",
}) {
  if (!adapter) {
    throw new Error("adapter is required");
  }

  async function resolveReference({ conversationId, target }) {
    if (conversationId) {
      const byConversationId =
        await getReferenceByConversationId(conversationId);
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

  async function proactiveSend(payload) {
    const reference = await resolveReference(payload);
    const outgoingActivity = buildOutgoingActivity(payload);
    let response;

    try {
      await adapter.continueConversation(reference, async (turnContext) => {
        response = await turnContext.sendActivity(outgoingActivity);
      });
    } catch (error) {
      const errorCode = error.statusCode || error.status;
      if (errorCode === 401 || errorCode === 403) {
        throw new SendError("Bot authentication failed for proactive send.", 502);
      }

      throw new SendError(
        `Conversation is not valid for proactive send: ${error.message}`,
        409,
      );
    }

    return {
      status: "sent",
      conversationId: reference.conversation?.id || payload.conversationId,
      activityId: response?.id || null,
    };
  }

  return { proactiveSend };
}

module.exports = { createSendService, SendError, buildOutgoingActivity };
