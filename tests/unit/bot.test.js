const test = require("node:test");
const assert = require("node:assert/strict");
const { ActivityHandler } = require("botbuilder");
const { createBot } = require("../../src/bot/bot");
const {
  buildSubmittedStateCard,
  sanitizeActionData,
  extractBindToken,
  formatCopyText,
} = require("../../src/bot/TeamsIntegrationBot");
const {
  mapTenantId,
  createUpdate,
  formatActionConfirmation,
} = require("../../src/bot/updateMapper");

test("mapTenantId resolves tenant from conversation or channelData", () => {
  assert.equal(
    mapTenantId({ conversation: { tenantId: "tenant-conversation" } }),
    "tenant-conversation",
  );
  assert.equal(
    mapTenantId({ channelData: { tenant: { id: "tenant-channel-data" } } }),
    "tenant-channel-data",
  );
  assert.equal(mapTenantId({}), null);
});

test("createUpdate maps activity fields into queue payload", () => {
  const payload = createUpdate(
    {
      id: "a1",
      from: { id: "u1", name: "Ihor" },
      conversation: { id: "c1", tenantId: "t1" },
    },
    "card.submit",
    { action: "approve" },
  );

  assert.equal(payload.type, "card.submit");
  assert.equal(payload.activityId, "a1");
  assert.equal(payload.from.id, "u1");
  assert.equal(payload.from.name, "Ihor");
  assert.equal(payload.tenantId, "t1");
  assert.equal(payload.conversationId, "c1");
  assert.deepEqual(payload.data, { action: "approve" });
});

test("formatActionConfirmation renders action specific and fallback texts", () => {
  assert.equal(formatActionConfirmation({ action: "approve" }), "✅ Обрано: approve");
  assert.equal(
    formatActionConfirmation({ action: "approve", __actionTitle: "Погодити заявку" }),
    "✅ Обрано: Погодити заявку",
  );
  assert.equal(
    formatActionConfirmation({}),
    "✅ Вашу відповідь зафіксовано.",
  );
});

test("bot onInvokeActivity enqueues adaptive card execute updates", async () => {
  const updates = [];
  const bot = createBot({
    enqueueUpdate: async (update) => updates.push(update),
    saveConversationReference: async () => {},
  });

  const response = await bot.onInvokeActivity({
    activity: {
      id: "invoke-1",
      name: "adaptiveCard/action",
      from: { id: "u1", name: "Ihor" },
      conversation: { id: "c1" },
      value: { action: { data: { action: "approve", requestId: "R1" } } },
    },
  });

  assert.deepEqual(response, { status: 200 });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].type, "card.execute");
  assert.deepEqual(updates[0].data, { action: "approve", requestId: "R1" });
});

test("bot run stores reference with extracted email", async () => {
  const saveCalls = [];
  const bot = createBot({
    enqueueUpdate: async () => {},
    saveConversationReference: async (...args) => saveCalls.push(args),
  });

  const originalRun = ActivityHandler.prototype.run;
  ActivityHandler.prototype.run = async () => {};

  try {
    await bot.run({
      activity: {
        id: "m1",
        channelId: "msteams",
        serviceUrl: "https://smba.trafficmanager.net/emea/",
        conversation: { id: "conv-1" },
        recipient: { id: "bot-id" },
        from: { id: "user-id", userPrincipalName: "ihor.neshyk@ukroliya.com" },
      },
    });
  } finally {
    ActivityHandler.prototype.run = originalRun;
  }

  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0][0].conversation.id, "conv-1");
  assert.equal(saveCalls[0].length, 1);
});

test("bot replies with plain text on copy request and does not enqueue update", async () => {
  const updates = [];
  const sent = [];
  const bot = createBot({
    enqueueUpdate: async (update) => updates.push(update),
    saveConversationReference: async () => {},
  });

  await bot.run({
    activity: {
      type: "message",
      id: "m-copy",
      channelId: "msteams",
      serviceUrl: "https://smba.trafficmanager.net/emea/",
      conversation: { id: "conv-copy" },
      recipient: { id: "bot-id" },
      from: { id: "user-id" },
      value: {
        __copyRequest: true,
        __copyText: "Погодити наказ\nНаказ: 000000006",
      },
    },
    sendActivity: async (activity) => {
      sent.push(activity);
      return { id: "sent-copy-1" };
    },
    updateActivity: async () => {
      throw new Error("card must not be updated on copy request");
    },
  });

  assert.equal(updates.length, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0], "Погодити наказ  \nНаказ: 000000006");
});

test("formatCopyText keeps line breaks visible in Teams markdown", () => {
  assert.equal(formatCopyText("line1\nline2\nline3"), "line1  \nline2  \nline3");
  assert.equal(formatCopyText("line1\r\nline2"), "line1  \nline2");
  assert.equal(formatCopyText("  padded  \n  next  "), "padded  \n  next");
  assert.equal(formatCopyText(null), "");
});

test("buildSubmittedStateCard keeps original card body and single selected action", () => {
  const card = buildSubmittedStateCard({
    action: "approve",
    requestId: "REQ-1",
    __actionTitle: "Approve",
    __originalCard: {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.5",
      body: [{ type: "TextBlock", text: "Original body stays" }],
    },
  });

  assert.equal(card.type, "AdaptiveCard");
  assert.equal(card.body[0].text, "Original body stays");
  assert.equal(card.actions.length, 0);
  assert.equal(card.body[1].text, "Обрана дія: Approve");
});

test("buildSubmittedStateCard converts input fields to read-only submitted values", () => {
  const card = buildSubmittedStateCard({
    action: "reject_or_request_clarification",
    __actionTitle: "Відхилити",
    comment: "Потрібно виправити суму",
    amount: "1500",
    __originalCard: {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        { type: "TextBlock", text: "Запит на погодження" },
        { type: "Input.Text", id: "comment", label: "Коментар" },
        { type: "Input.Number", id: "amount", label: "Сума" },
      ],
      actions: [],
    },
  });

  assert.equal(card.actions.length, 0);
  assert.equal(card.body[0].text, "Запит на погодження");
  assert.equal(card.body[1].type, "TextBlock");
  assert.match(card.body[1].text, /Коментар: \*\*Потрібно виправити суму\*\*/);
  assert.equal(card.body[2].type, "TextBlock");
  assert.match(card.body[2].text, /Сума: \*\*1500\*\*/);
});

test("buildSubmittedStateCard resolves choice set value to title", () => {
  const card = buildSubmittedStateCard({
    action: "reject_or_request_clarification",
    __actionTitle: "Відхилити",
    ownershipType: "storage",
    __originalCard: {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "Input.ChoiceSet",
          id: "ownershipType",
          label: "Форма власності",
          style: "compact",
          choices: [
            { title: "Власне", value: "own" },
            { title: "Зберігання", value: "storage" },
          ],
        },
      ],
      actions: [],
    },
  });

  assert.equal(card.body[0].type, "TextBlock");
  assert.match(card.body[0].text, /Форма власності: \*\*Зберігання\*\*/);
});

test("buildSubmittedStateCard renders toggle checkmarks and selected request ids", () => {
  const card = buildSubmittedStateCard({
    action: "approve_selected",
    __actionTitle: "Погодити",
    selectionInputIds: ["sel_123", "sel_124", "sel_125"],
    candidateRequestIds: ["123", "124", "125"],
    sel_123: "false",
    sel_124: "true",
    sel_125: false,
    __originalCard: {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "Table",
          rows: [
            {
              type: "TableRow",
              cells: [
                {
                  type: "TableCell",
                  items: [{ type: "Input.Toggle", id: "sel_123", title: "" }],
                },
              ],
            },
            {
              type: "TableRow",
              cells: [
                {
                  type: "TableCell",
                  items: [{ type: "Input.Toggle", id: "sel_124", title: "" }],
                },
              ],
            },
          ],
        },
      ],
      actions: [],
    },
  });

  const toggleCell1 = card.body[0].rows[0].cells[0].items[0];
  const toggleCell2 = card.body[0].rows[1].cells[0].items[0];
  assert.equal(toggleCell1.type, "TextBlock");
  assert.equal(toggleCell1.text, "☐");
  assert.equal(toggleCell2.type, "TextBlock");
  assert.equal(toggleCell2.text, "☑");
  assert.equal(card.body[1].text, "Обрана дія: Погодити");
  assert.equal(card.body[2].text, "Відмічені заявки: 124");
});

test("sanitizeActionData removes internal action metadata", () => {
  const data = sanitizeActionData({
    action: "approve",
    requestId: "REQ-1",
    _locked: true,
    __actionTitle: "Approve",
    __originalCard: { body: [] },
    __requiredFields: ["comment", "amount"],
    __amountRule: "positive",
  });

  assert.deepEqual(data, { action: "approve", requestId: "REQ-1" });
});

test("extractBindToken parses LINK command and ignores other text", () => {
  assert.equal(extractBindToken("LINK abcDEF123"), "abcDEF123");
  assert.equal(extractBindToken(" link   token-1 "), "token-1");
  assert.equal(extractBindToken("hello"), null);
});
