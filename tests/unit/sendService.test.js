const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSendService,
  SendError,
  buildOutgoingActivity,
} = require("../../src/services/sendService");

test("buildOutgoingActivity validates payload", async () => {
  await assert.rejects(
    () => buildOutgoingActivity({}),
    (error) => error instanceof SendError && error.statusCode === 400,
  );
});

test("buildOutgoingActivity builds adaptive card and file attachment", async () => {
  const activity = await buildOutgoingActivity(
    {
      text: "Report attached",
      adaptiveCard: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.5",
        body: [{ type: "TextBlock", text: "Hello" }],
      },
      textFile: {
        fileName: "sample-report",
        content: "row1,value1\nrow2,value2",
      },
    },
    {
      uploadTextFile: async ({ fileName, content }) => ({
        fileName,
        downloadUrl: `https://files.example/${encodeURIComponent(fileName)}?len=${content.length}`,
      }),
    },
  );

  assert.equal(activity.type, "message");
  assert.match(activity.text, /Report attached/);
  assert.match(activity.text, /\[sample-report\.txt\]\(https:\/\/files\.example\//);
  assert.equal(activity.attachments.length, 1);
  assert.equal(
    activity.attachments[0].contentType,
    "application/vnd.microsoft.card.adaptive",
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

test("proactiveSend resolves by conversation id when provided", async () => {
  let usedReference = null;
  const adapter = {
    continueConversation: async (reference, callback) => {
      usedReference = reference;
      await callback({
        sendActivity: async () => ({ id: "activity-2" }),
      });
    },
  };

  const sendService = createSendService({
    adapter,
    getReferenceByConversationId: async (conversationId) => ({
      conversation: { id: conversationId },
      channelId: "msteams",
      serviceUrl: "https://smba.trafficmanager.net/emea/",
      bot: { id: "bot-id" },
    }),
    getReferenceByTarget: async () => null,
  });

  const result = await sendService.proactiveSend({
    conversationId: "conversation-explicit",
    text: "hello",
  });

  assert.equal(result.status, "sent");
  assert.equal(usedReference.conversation.id, "conversation-explicit");
});

test("proactiveSend returns 404 when target reference is missing", async () => {
  const sendService = createSendService({
    adapter: { continueConversation: async () => {} },
    getReferenceByConversationId: async () => null,
    getReferenceByTarget: async () => null,
    defaultTarget: "default",
  });

  await assert.rejects(
    () => sendService.proactiveSend({ text: "hello" }),
    (error) => error instanceof SendError && error.statusCode === 404,
  );
});

test("proactiveSend maps auth errors to 502", async () => {
  const adapter = {
    continueConversation: async () => {
      const error = new Error("forbidden");
      error.statusCode = 403;
      throw error;
    },
  };
  const sendService = createSendService({
    adapter,
    getReferenceByConversationId: async () => null,
    getReferenceByTarget: async () => ({
      conversation: { id: "c1" },
      channelId: "msteams",
      serviceUrl: "https://smba.trafficmanager.net/emea/",
      bot: { id: "bot-id" },
    }),
  });

  await assert.rejects(
    () => sendService.proactiveSend({ text: "hello" }),
    (error) =>
      error instanceof SendError &&
      error.statusCode === 502 &&
      error.message === "Bot authentication failed for proactive send.",
  );
});

test("proactiveSend maps non-auth send errors to 409", async () => {
  const adapter = {
    continueConversation: async () => {
      throw new Error("conversation gone");
    },
  };
  const sendService = createSendService({
    adapter,
    getReferenceByConversationId: async () => null,
    getReferenceByTarget: async () => ({
      conversation: { id: "c1" },
      channelId: "msteams",
      serviceUrl: "https://smba.trafficmanager.net/emea/",
      bot: { id: "bot-id" },
    }),
  });

  await assert.rejects(
    () => sendService.proactiveSend({ text: "hello" }),
    (error) =>
      error instanceof SendError &&
      error.statusCode === 409 &&
      error.message.includes("Conversation is not valid for proactive send"),
  );
});
