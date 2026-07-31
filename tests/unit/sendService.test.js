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
  const result = await buildOutgoingActivity(
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

  assert.equal(result.activity.type, "message");
  assert.match(result.activity.text, /Report attached/);
  assert.match(result.activity.text, /\[sample-report\.txt\]\(https:\/\/files\.example\//);
  assert.equal(result.activity.attachments.length, 1);
  assert.equal(
    result.activity.attachments[0].contentType,
    "application/vnd.microsoft.card.adaptive",
  );
  assert.equal(result.uploadedFiles.length, 1);
});

test("buildOutgoingActivity adds hidden copy text block and toggle action", async () => {
  const result = await buildOutgoingActivity({
    adaptiveCard: {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        { type: "TextBlock", weight: "Bolder", text: "Погодити наказ" },
        { type: "TextBlock", text: "Наказ: 000000006" },
        {
          type: "FactSet",
          facts: [
            { title: "Сировина", value: "Соняшник" },
            { title: "Ціна:", value: "32 000 грн/т" },
          ],
        },
        {
          type: "Table",
          rows: [
            {
              type: "TableRow",
              cells: [
                { type: "TableCell", items: [{ type: "TextBlock", text: "123" }] },
                { type: "TableCell", items: [{ type: "TextBlock", text: "Вітчизна" }] },
              ],
            },
          ],
        },
        { type: "Input.Text", id: "comment", label: "Коментар" },
      ],
      actions: [
        {
          type: "Action.Submit",
          title: "Погодити",
          data: { action: "approve_request", requestId: "REQ-1" },
        },
      ],
    },
  });

  const card = result.activity.attachments[0].content;
  const copyBlock = card.body.find((item) => item.id === "__copyText");
  assert.ok(copyBlock, "expected hidden copy text block");
  assert.equal(copyBlock.isVisible, false);
  assert.match(copyBlock.text, /Погодити наказ/);
  assert.match(copyBlock.text, /Наказ: 000000006/);
  assert.match(copyBlock.text, /Сировина: Соняшник/);
  assert.match(copyBlock.text, /Ціна: 32 000 грн\/т/);
  assert.match(copyBlock.text, /123 \| Вітчизна/);
  assert.doesNotMatch(copyBlock.text, /Коментар/);

  const toggle = card.actions.find(
    (action) => action.type === "Action.ToggleVisibility",
  );
  assert.ok(toggle, "expected toggle action");
  assert.deepEqual(toggle.targetElements, ["__copyText"]);

  // submit snapshot must not include the injected copy block
  const submitData = card.actions.find((a) => a.type === "Action.Submit").data;
  assert.ok(submitData.__originalCard);
  assert.equal(
    submitData.__originalCard.body.some((item) => item.id === "__copyText"),
    false,
  );
});

test("buildOutgoingActivity enriches adaptive card submit actions with snapshot", async () => {
  const result = await buildOutgoingActivity({
    adaptiveCard: {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.5",
      body: [{ type: "TextBlock", text: "Original content" }],
      actions: [
        {
          type: "Action.Submit",
          title: "Approve",
          data: { action: "approve", requestId: "REQ-100" },
        },
      ],
    },
  });

  const submitData = result.activity.attachments[0].content.actions[0].data;
  assert.equal(submitData.action, "approve");
  assert.equal(submitData.__actionTitle, "Approve");
  assert.ok(submitData.__originalCard);
  assert.equal(submitData.__originalCard.body[0].text, "Original content");
  assert.equal(submitData.__originalCard.actions, undefined);
});

test("buildOutgoingActivity enriches reject action with default required fields", async () => {
  const result = await buildOutgoingActivity({
    adaptiveCard: {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        { type: "Input.Text", id: "comment", label: "Коментар" },
        { type: "Input.Number", id: "amount", label: "Сума" },
      ],
      actions: [
        {
          type: "Action.Submit",
          title: "Відхилити",
          data: {
            action: "reject_or_request_clarification",
            requestId: "REQ-200",
          },
        },
      ],
    },
  });

  const submitData = result.activity.attachments[0].content.actions[0].data;
  assert.deepEqual(submitData.__requiredFields, ["comment", "amount"]);
  assert.deepEqual(submitData.__numericFields, ["amount"]);
  assert.equal(submitData.__amountRule, "positive");
});

test("buildOutgoingActivity uploads base64 file and appends attachment link", async () => {
  const payload = {
    text: "Please review the file",
    base64File: {
      fileName: "invoice.pdf",
      contentType: "application/pdf",
      base64Body: Buffer.from("binary-pdf-content").toString("base64"),
    },
  };

  const result = await buildOutgoingActivity(payload, {
    uploadBinaryFile: async ({ fileName, contentType }) => ({
      fileName,
      contentType,
      downloadUrl: "https://files.example/invoice.pdf?sig=1",
    }),
  });

  assert.equal(result.activity.type, "message");
  assert.match(result.activity.text, /Please review the file/);
  assert.match(
    result.activity.text,
    /\[invoice\.pdf\]\(https:\/\/files\.example\/invoice\.pdf\?sig=1\)/,
  );
  assert.deepEqual(result.uploadedFiles, [
    {
      fileName: "invoice.pdf",
      contentType: "application/pdf",
      downloadUrl: "https://files.example/invoice.pdf?sig=1",
    },
  ]);
});

test("buildOutgoingActivity validates base64 file payload fields", async () => {
  await assert.rejects(
    () =>
      buildOutgoingActivity({
        base64File: {
          contentType: "application/pdf",
          base64Body: "dGVzdA==",
        },
      }),
    (error) => error instanceof SendError && error.statusCode === 400,
  );
});

test("proactiveSend resolves explicit target and sends message", async () => {
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
  });

  const result = await sendService.proactiveSend({ target: "user-a", text: "hello" });

  assert.equal(result.status, "sent");
  assert.equal(result.conversationId, "conversation-for-user-a");
  assert.ok(sentActivity);
  assert.deepEqual(result.uploadedFiles, []);
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
  });

  await assert.rejects(
    () => sendService.proactiveSend({ target: "user-missing", text: "hello" }),
    (error) => error instanceof SendError && error.statusCode === 404,
  );
});

test("proactiveSend returns 400 when neither conversationId nor target provided", async () => {
  const sendService = createSendService({
    adapter: { continueConversation: async () => {} },
    getReferenceByConversationId: async () => null,
    getReferenceByTarget: async () => null,
  });

  await assert.rejects(
    () => sendService.proactiveSend({ text: "hello" }),
    (error) =>
      error instanceof SendError &&
      error.statusCode === 400 &&
      error.message.includes("conversationId"),
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
    () => sendService.proactiveSend({ target: "user-a", text: "hello" }),
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
    () => sendService.proactiveSend({ target: "user-a", text: "hello" }),
    (error) =>
      error instanceof SendError &&
      error.statusCode === 409 &&
      error.message.includes("Conversation is not valid for proactive send"),
  );
});

