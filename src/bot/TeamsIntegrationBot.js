const { ActivityHandler, TurnContext } = require("botbuilder");
const {
  createUpdate,
  formatActionConfirmation,
} = require("./updateMapper");

function extractBindToken(text) {
  if (!(typeof text === "string" && text.trim())) {
    return null;
  }

  const match = text.trim().match(/^link\s+([a-zA-Z0-9\-_\.=]+)$/i);
  return match ? match[1] : null;
}

function sanitizeActionData(data = {}) {
  if (!data || typeof data !== "object") {
    return {};
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "_locked" || key.startsWith("__")) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function toDisplayText(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : "—";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function isSelectedValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }

  return false;
}

function getSelectedRequestIds(data = {}) {
  const selectionInputIds = Array.isArray(data.selectionInputIds)
    ? data.selectionInputIds.filter((id) => typeof id === "string" && id.trim())
    : [];
  const candidateRequestIds = Array.isArray(data.candidateRequestIds)
    ? data.candidateRequestIds
        .map((id) => (id === null || id === undefined ? "" : String(id).trim()))
        .filter(Boolean)
    : [];

  if (selectionInputIds.length > 0 && candidateRequestIds.length > 0) {
    return selectionInputIds
      .map((inputId, index) =>
        isSelectedValue(data[inputId]) ? candidateRequestIds[index] || null : null,
      )
      .filter(Boolean);
  }

  return Object.entries(data)
    .filter(([key, value]) => key.startsWith("sel_") && isSelectedValue(value))
    .map(([key]) => key.replace(/^sel_/, ""))
    .filter(Boolean);
}

function convertInputToReadOnly(element, submittedData) {
  const inputId =
    typeof element.id === "string" && element.id.trim() ? element.id.trim() : null;
  const label =
    typeof element.label === "string" && element.label.trim()
      ? element.label.trim()
      : inputId || "Value";
  let rawValue = inputId ? submittedData[inputId] : null;

  if (
    element.type === "Input.ChoiceSet" &&
    Array.isArray(element.choices) &&
    rawValue !== null &&
    rawValue !== undefined
  ) {
    const selected = element.choices.find(
      (choice) => choice && choice.value === String(rawValue),
    );
    if (selected && typeof selected.title === "string" && selected.title.trim()) {
      rawValue = selected.title.trim();
    }
  }

  if (element.type === "Input.Toggle") {
    return {
      type: "TextBlock",
      spacing: element.spacing || "Small",
      horizontalAlignment: "Center",
      text: isSelectedValue(rawValue) ? "☑" : "☐",
    };
  }

  const value = toDisplayText(rawValue);

  return {
    type: "TextBlock",
    wrap: true,
    spacing: element.spacing || "Small",
    text: `${label}: **${value}**`,
  };
}

function freezeSubmittedInputs(node, submittedData) {
  if (Array.isArray(node)) {
    return node.map((item) => freezeSubmittedInputs(item, submittedData));
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  if (typeof node.type === "string" && node.type.startsWith("Input.")) {
    return convertInputToReadOnly(node, submittedData);
  }

  const result = { ...node };
  for (const [key, value] of Object.entries(result)) {
    if (Array.isArray(value) || (value && typeof value === "object")) {
      result[key] = freezeSubmittedInputs(value, submittedData);
    }
  }
  return result;
}

function buildSubmittedStateCard(data = {}) {
  const action = typeof data.action === "string" ? data.action : "received";
  const selectedTitle =
    typeof data.__actionTitle === "string" && data.__actionTitle.trim()
      ? data.__actionTitle.trim()
      : action;
  const requestId =
    typeof data.requestId === "string" && data.requestId.trim()
      ? data.requestId.trim()
      : null;

  const originalCard =
    data.__originalCard && typeof data.__originalCard === "object"
      ? JSON.parse(JSON.stringify(data.__originalCard))
      : null;

  if (originalCard) {
    const body = Array.isArray(originalCard.body)
      ? freezeSubmittedInputs(originalCard.body, data)
      : [];
    const selectedRequestIds = getSelectedRequestIds(data);
    body.push({
      type: "TextBlock",
      spacing: "Medium",
      weight: "Bolder",
      wrap: true,
      text: `Обрана дія: ${selectedTitle}`,
    });
    if (selectedRequestIds.length > 0) {
      body.push({
        type: "TextBlock",
        spacing: "Small",
        wrap: true,
        text: `Відмічені заявки: ${selectedRequestIds.join(", ")}`,
      });
    }

    return {
      ...originalCard,
      body,
      actions: [],
    };
  }

  const body = [
    {
      type: "TextBlock",
      weight: "Bolder",
      size: "Medium",
      text: "Заявку оброблено",
    },
    {
      type: "TextBlock",
      wrap: true,
      text: `Обрана дія: ${selectedTitle}`,
    },
  ];
  if (requestId) {
    body.push({
      type: "FactSet",
      facts: [{ title: "Номер заявки:", value: requestId }],
    });
  }
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body,
    actions: [],
  };
}

function formatCopyText(text) {
  if (typeof text !== "string") {
    return "";
  }

  // Teams collapses single newlines in markdown, so force hard line breaks.
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("  \n")
    .trim();
}

async function tryUpdateSubmittedCard(context, data) {
  const originalActivityId = context.activity.replyToId;
  if (!originalActivityId) {
    return;
  }

  try {
    await context.updateActivity({
      id: originalActivityId,
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: buildSubmittedStateCard(data),
        },
      ],
    });
  } catch (error) {
    // Best-effort UX update: action processing should still succeed.
    console.warn("Card update failed:", error.message || error);
  }
}

class TeamsIntegrationBot extends ActivityHandler {
  constructor({
    enqueueUpdate,
    saveConversationReference,
    bindService,
    saveReferenceByEmail,
  }) {
    super();
    this.enqueueUpdate = enqueueUpdate;
    this.saveConversationReference = saveConversationReference;
    this.bindService = bindService;
    this.saveReferenceByEmail = saveReferenceByEmail;

    this.onMessage(async (context, next) => {
      const hasCardPayload = Boolean(context.activity.value);

      if (hasCardPayload) {
        if (context.activity.value && context.activity.value.__copyRequest) {
          const copyText = formatCopyText(context.activity.value.__copyText);
          await context.sendActivity(
            copyText || "Немає тексту для копіювання.",
          );
          await next();
          return;
        }

        if (context.activity.value && context.activity.value._locked) {
          await context.sendActivity("Відповідь вже зафіксовано.");
          await next();
          return;
        }

        const cleanData = sanitizeActionData(context.activity.value);
        const update = createUpdate(
          context.activity,
          "card.submit",
          cleanData,
        );
        await this.enqueueUpdate(update);
        await tryUpdateSubmittedCard(context, context.activity.value);
        await context.sendActivity(formatActionConfirmation(context.activity.value));
      } else {
        const bindToken = extractBindToken(context.activity.text);
        if (bindToken && this.bindService && this.saveReferenceByEmail) {
          const bindResult = await this.bindService.consume(bindToken);
          if (!bindResult.ok) {
            if (bindResult.reason === "used") {
              await context.sendActivity("Цей код вже використано.");
            } else if (bindResult.reason === "expired") {
              await context.sendActivity("Термін дії коду минув. Згенеруйте новий код у 1С.");
            } else {
              await context.sendActivity("Код прив'язки недійсний.");
            }
            await next();
            return;
          }

          const reference = TurnContext.getConversationReference(context.activity);
          await this.saveReferenceByEmail(reference, bindResult.email);
          await context.sendActivity(`✅ Прив'язку виконано для ${bindResult.email}.`);
          await next();
          return;
        }

        await context.sendActivity("OK");
      }
      await next();
    });
  }

  async run(context) {
    const reference = TurnContext.getConversationReference(context.activity);
    await this.saveConversationReference(reference);
    await super.run(context);
  }

  async onInvokeActivity(context) {
    if (context.activity.name === "adaptiveCard/action") {
      const data = context.activity.value?.action?.data || context.activity.value;
      const update = createUpdate(context.activity, "card.execute", data);
      await this.enqueueUpdate(update);
    }

    return { status: 200 };
  }
}

module.exports = {
  TeamsIntegrationBot,
  buildSubmittedStateCard,
  sanitizeActionData,
  extractBindToken,
  formatCopyText,
};
