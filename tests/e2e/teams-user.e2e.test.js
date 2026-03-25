const test = require("node:test");
const assert = require("node:assert/strict");
const dotenv = require("dotenv");

dotenv.config({ path: ".env.e2e" });

const baseUrl = process.env.SERVICE_BASE_URL;
const bearerToken = process.env.API_BEARER_TOKEN;
const targetEmail = process.env.TARGET_EMAIL || "ihor.neshyk@granary.systems";
const runReceiveTest = process.env.RUN_RECEIVE_TEST === "1";
const receivePollAttempts = Number.parseInt(
  process.env.RECEIVE_POLL_ATTEMPTS || "20",
  10,
);
const receivePollIntervalMs = Number.parseInt(
  process.env.RECEIVE_POLL_INTERVAL_MS || "5000",
  10,
);
const maxUpdatesPerPoll = Number.parseInt(process.env.RECEIVE_MAX || "10", 10);
const expectedConversationId = process.env.EXPECTED_CONVERSATION_ID || "";

function getHeaders() {
  return {
    Authorization: `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeTargetUser(update) {
  if (expectedConversationId && update.conversationId === expectedConversationId) {
    return true;
  }

  const fromId = String(update.from?.id || "").toLowerCase();
  const fromName = String(update.from?.name || "").toLowerCase();
  const payload = JSON.stringify(update).toLowerCase();
  const targetNeedle = targetEmail.toLowerCase();
  const shortNeedle = targetNeedle.split("@")[0];

  return (
    fromId.includes(targetNeedle) ||
    fromName.includes(targetNeedle) ||
    fromId.includes(shortNeedle) ||
    fromName.includes(shortNeedle) ||
    payload.includes(targetNeedle)
  );
}

async function callJson(path, method, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  let responseJson = null;
  try {
    responseJson = await response.json();
  } catch (_err) {
    responseJson = null;
  }

  return { response, responseJson };
}

test("send text message to target user", async () => {
  assert.ok(baseUrl, "SERVICE_BASE_URL is required in .env.e2e");
  assert.ok(bearerToken, "API_BEARER_TOKEN is required in .env.e2e");

  const payload = {
    target: targetEmail,
    text: `E2E ping for ${targetEmail} at ${new Date().toISOString()}`,
  };

  const { response, responseJson } = await callJson("/send", "POST", payload);

  assert.equal(
    response.status,
    200,
    `Expected /send status 200, got ${response.status}: ${JSON.stringify(responseJson)}`,
  );
  assert.equal(responseJson?.status, "sent");
});

const maybeTest = runReceiveTest ? test : test.skip;

maybeTest(
  "receive user update and acknowledge it",
  { timeout: receivePollAttempts * receivePollIntervalMs + 15000 },
  async () => {
    assert.ok(baseUrl, "SERVICE_BASE_URL is required in .env.e2e");
    assert.ok(bearerToken, "API_BEARER_TOKEN is required in .env.e2e");

    let matchedUpdate = null;

    for (let attempt = 1; attempt <= receivePollAttempts; attempt += 1) {
      const { response, responseJson } = await callJson(
        `/updates?max=${maxUpdatesPerPoll}`,
        "GET",
      );

      assert.equal(
        response.status,
        200,
        `Expected /updates status 200, got ${response.status}: ${JSON.stringify(responseJson)}`,
      );

      const updates = Array.isArray(responseJson?.updates) ? responseJson.updates : [];
      matchedUpdate = updates.find(looksLikeTargetUser) || null;

      if (matchedUpdate) {
        break;
      }

      await sleep(receivePollIntervalMs);
    }

    assert.ok(
      matchedUpdate,
      `No update found for ${targetEmail}. Ask the user to click a bot card button, or set EXPECTED_CONVERSATION_ID in .env.e2e.`,
    );
    assert.ok(matchedUpdate.updateId, "Matched update must include updateId.");
    assert.ok(matchedUpdate.popReceipt, "Matched update must include popReceipt.");

    const ackPayload = {
      updateId: matchedUpdate.updateId,
      popReceipt: matchedUpdate.popReceipt,
    };
    const { response, responseJson } = await callJson("/ack", "POST", ackPayload);

    assert.equal(
      response.status,
      200,
      `Expected /ack status 200, got ${response.status}: ${JSON.stringify(responseJson)}`,
    );
    assert.equal(responseJson?.status, "acknowledged");
  },
);
