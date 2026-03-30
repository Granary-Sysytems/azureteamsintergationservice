const test = require("node:test");
const assert = require("node:assert/strict");
const { readConfig } = require("../../src/config/env");

function baseEnv() {
  return {
    BOT_APP_ID: "app-id",
    BOT_APP_PASSWORD: "secret",
    AZURE_STORAGE_CONNECTION_STRING:
      "DefaultEndpointsProtocol=https;AccountName=acc;AccountKey=key;EndpointSuffix=core.windows.net",
    API_BEARER_TOKEN: "token",
  };
}

test("readConfig validates required keys", () => {
  const env = baseEnv();
  delete env.BOT_APP_ID;
  assert.throws(() => readConfig(env), /Missing required environment variable: BOT_APP_ID/);
});

test("readConfig validates port", () => {
  assert.throws(
    () => readConfig({ ...baseEnv(), PORT: "0" }),
    /PORT must be a positive integer/,
  );
});

test("readConfig applies defaults and optional tenant fallback", () => {
  const config = readConfig({
    ...baseEnv(),
    TENANT_ID: "tenant-a",
  });

  assert.equal(config.port, 3978);
  assert.equal(config.botAppTenantId, "tenant-a");
  assert.equal(config.queueName, "teams-updates");
  assert.equal(config.tableName, "ConversationReferences");
  assert.equal(config.defaultTarget, "default");
});
