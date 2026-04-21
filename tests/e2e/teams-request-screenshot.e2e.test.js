const test = require("node:test");
const assert = require("node:assert/strict");
const dotenv = require("dotenv");

dotenv.config({ path: ".env.e2e" });

const baseUrl = process.env.SERVICE_BASE_URL;
const bearerToken = process.env.API_BEARER_TOKEN;
const targetEmail = process.env.TARGET_EMAIL || "ihor.neshyk@ukroliya.com";

function getHeaders() {
  return {
    Authorization: `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
  };
}

test("send screenshot-based request card with UA titles and EN values", async () => {
  assert.ok(baseUrl, "SERVICE_BASE_URL is required in .env.e2e");
  assert.ok(bearerToken, "API_BEARER_TOKEN is required in .env.e2e");

  const requestId = `REQ-SCREEN-${Date.now()}`;
  const payload = {
    target: targetEmail,
    text: `Заявка на погодження (${requestId})`,
    adaptiveCard: {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "TextBlock",
          weight: "Bolder",
          size: "Medium",
          text: "Погодити заявку",
        },
        {
          type: "FactSet",
          facts: [
            { title: "Номер:", value: "000000018" },
            { title: "Дата:", value: "31.03.2026 14:50" },
            { title: "Статус:", value: "Нова" },
            { title: "Контрагент:", value: "ВОРОЖБА ЛАНДІНВЕСТ, ТОВ" },
            { title: "Дата договору:", value: "30.03.2026" },
          ],
        },
        {
          type: "TextBlock",
          weight: "Bolder",
          text: "Позиція",
          spacing: "Medium",
        },
        {
          type: "FactSet",
          facts: [
            { title: "Номенклатура:", value: "Соняшник для виробництва ..." },
            { title: "Кількість, т:", value: "2 500,0" },
            { title: "Білок, %:", value: "14,00" },
            { title: "Кислотність:", value: "23,00" },
            { title: "Спосіб оплати:", value: "Передплата" },
            { title: "Ставка ПДВ:", value: "ПДВ 14" },
            { title: "Ціна, грн:", value: "32 000,00" },
            { title: "Доплата, грн:", value: "120,00" },
            { title: "Разом, грн:", value: "32 120,00" },
          ],
        },
      ],
      actions: [
        {
          type: "Action.Submit",
          title: "Погодити заявку",
          data: {
            action: "approve_request",
            requestId,
          },
        },
        {
          type: "Action.Submit",
          title: "Відхилити заявку або відправити на уточнення",
          data: {
            action: "reject_or_request_clarification",
            requestId,
          },
        },
      ],
    },
  };

  const response = await fetch(`${baseUrl}/send`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  let responseJson = null;
  try {
    responseJson = await response.json();
  } catch (_error) {
    responseJson = null;
  }

  assert.equal(
    response.status,
    200,
    `Expected /send status 200, got ${response.status}: ${JSON.stringify(responseJson)}`,
  );
  assert.equal(responseJson?.status, "sent");
});
