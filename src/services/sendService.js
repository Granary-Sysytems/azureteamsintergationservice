const { SendError } = require("./send/errors");
const { buildOutgoingActivity } = require("./send/buildOutgoingActivity");
const { resolveReference } = require("./send/resolveReference");

function createSendService({
  adapter,
  getReferenceByConversationId,
  getReferenceByTarget,
  defaultTarget = "default",
  uploadTextFile,
}) {
  if (!adapter) {
    throw new Error("adapter is required");
  }

  async function proactiveSend(payload) {
    const reference = await resolveReference(payload, {
      getReferenceByConversationId,
      getReferenceByTarget,
      defaultTarget,
    });
    const outgoingActivity = await buildOutgoingActivity(payload, {
      uploadTextFile,
    });
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
