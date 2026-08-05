const { SendError } = require("./send/errors");
const { buildOutgoingActivity } = require("./send/buildOutgoingActivity");
const { resolveReference } = require("./send/resolveReference");

function createSendService({
  adapter,
  getReferenceByConversationId,
  getReferenceByTarget,
  uploadTextFile,
  uploadBinaryFile,
}) {
  if (!adapter) {
    throw new Error("adapter is required");
  }

  async function proactiveSend(payload) {
    const reference = await resolveReference(payload, {
      getReferenceByConversationId,
      getReferenceByTarget,
    });
    const { activity: outgoingActivity, uploadedFiles } = await buildOutgoingActivity(payload, {
      uploadTextFile,
      uploadBinaryFile,
    });

    const channelRootId = String(reference.conversation?.id || "").split(";")[0];
    const wantsNewThread =
      Boolean(payload.newThread) && channelRootId.includes("@thread");

    let response;
    let newThreadId = null;

    try {
      await adapter.continueConversation(reference, async (turnContext) => {
        if (wantsNewThread) {
          const connectorClient = turnContext.adapter.createConnectorClient(
            turnContext.activity.serviceUrl,
          );
          const created = await connectorClient.conversations.createConversation({
            isGroup: true,
            channelData: { channel: { id: channelRootId } },
            activity: outgoingActivity,
          });
          newThreadId = created?.id || null;
          response = { id: created?.activityId || null };
        } else {
          response = await turnContext.sendActivity(outgoingActivity);
        }
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

    const result = {
      status: "sent",
      conversationId:
        newThreadId || reference.conversation?.id || payload.conversationId,
      activityId: response?.id || null,
      uploadedFiles,
    };

    if (newThreadId) {
      result.threadId = newThreadId;
    }

    return result;
  }

  return { proactiveSend };
}

module.exports = { createSendService, SendError, buildOutgoingActivity };
