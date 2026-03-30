const requiredKeys = [
  "BOT_APP_ID",
  "BOT_APP_PASSWORD",
  "AZURE_STORAGE_CONNECTION_STRING",
  "API_BEARER_TOKEN",
];

function readConfig(env = process.env) {
  for (const key of requiredKeys) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const port = Number.parseInt(env.PORT || "3978", 10);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return {
    port,
    botAppId: env.BOT_APP_ID,
    botAppPassword: env.BOT_APP_PASSWORD,
    botAppTenantId: env.BOT_APP_TENANT_ID || env.TENANT_ID || null,
    storageConnectionString: env.AZURE_STORAGE_CONNECTION_STRING,
    queueName: env.AZURE_QUEUE_NAME || "teams-updates",
    tableName: env.AZURE_TABLE_NAME || "ConversationReferences",
    apiBearerToken: env.API_BEARER_TOKEN,
    defaultTarget: env.DEFAULT_TARGET || "default",
  };
}

let cachedConfig;

function getConfig() {
  if (!cachedConfig) {
    cachedConfig = readConfig();
  }
  return cachedConfig;
}

module.exports = { getConfig, readConfig };
