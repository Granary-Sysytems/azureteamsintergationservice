const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSendService,
  SendError,
  buildOutgoingActivity,
} = require("../../src/services/sendService");

test("buildOutgoingActivity validates payload", () => {
  assert.throws(
    () => buildOutgoingActivity({}),
    (error) => error instanceof SendError && error.statusCode === 400,
  );
});

test("proactiveSend resolves default target and sends message", async () => {
  let sentActivity = null;
  const adapter = {
    continueConversation: async (_reference, callback) => {
      await callback({
        sendActivity: async (activity) => {
          sentActivity = activity;
          return { id: "activity-1" };
        },
      });
    },
  };
  const sendService = createSendService({
    adapter,
    getReferenceByConversationId: async () => null,
    getReferenceByTarget: async (target) => ({
      conversation: { id: `conversation-for-${target}` },
      channelId: "msteams",
      serviceUrl: "https://smba.trafficmanager.net/emea/",
      bot: { id: "bot-id" },
    }),
    defaultTarget: "default",
  });

  const result = await sendService.proactiveSend({ text: "hello" });

  assert.equal(result.status, "sent");
  assert.equal(result.conversationId, "conversation-for-default");
  assert.ok(sentActivity);
});
