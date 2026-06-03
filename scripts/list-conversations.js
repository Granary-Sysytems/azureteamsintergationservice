#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { TableClient } = require("@azure/data-tables");

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const rootDir = path.resolve(__dirname, "..");
loadDotEnvFile(path.join(rootDir, ".env"));
loadDotEnvFile(path.join(rootDir, "config", "azure.env"));
loadDotEnvFile(path.join(rootDir, "config", "azure.secrets.env"));

const connectionString =
  process.env.AZURE_STORAGE_CONNECTION_STRING ||
  process.env.STORAGE_CONNECTION_STRING;
const tableName = process.env.AZURE_TABLE_NAME || "ConversationReferences";

if (!connectionString) {
  console.error(
    "AZURE_STORAGE_CONNECTION_STRING is not set (checked .env, config/azure.env, config/azure.secrets.env).",
  );
  process.exit(1);
}

const filterArg = process.argv[2];

function pickConversationType(reference) {
  const conv = reference?.conversation || {};
  if (conv.conversationType) {
    return conv.conversationType;
  }
  if (conv.isGroup === true) {
    return "groupChat";
  }
  if (conv.isGroup === false) {
    return "personal";
  }
  return "unknown";
}

(async () => {
  const tableClient = TableClient.fromConnectionString(connectionString, tableName);
  const rows = [];

  for await (const entity of tableClient.listEntities({
    queryOptions: { filter: "PartitionKey eq 'teams'" },
  })) {
    if (!entity.rowKey || !entity.rowKey.startsWith("conversationId:")) {
      continue;
    }
    let reference = {};
    try {
      reference = JSON.parse(entity.reference || "{}");
    } catch (_error) {
      // keep empty reference if it is not JSON
    }
    const conv = reference.conversation || {};
    const row = {
      type: pickConversationType(reference),
      conversationId: conv.id || entity.conversationId,
      name: conv.name || null,
      tenantId: conv.tenantId || reference.channelData?.tenant?.id || null,
      target: entity.target || null,
      serviceUrl: reference.serviceUrl || null,
    };
    if (filterArg && !JSON.stringify(row).toLowerCase().includes(filterArg.toLowerCase())) {
      continue;
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    console.log("No conversation references found.");
    return;
  }

  rows.sort((a, b) => (a.type || "").localeCompare(b.type || ""));

  for (const row of rows) {
    console.log("--------------------------------------------------------------------");
    console.log(`type           : ${row.type}`);
    console.log(`conversationId : ${row.conversationId}`);
    if (row.name) console.log(`name           : ${row.name}`);
    if (row.tenantId) console.log(`tenantId       : ${row.tenantId}`);
    if (row.target) console.log(`target         : ${row.target}`);
    if (row.serviceUrl) console.log(`serviceUrl     : ${row.serviceUrl}`);
  }
  console.log("--------------------------------------------------------------------");
  console.log(`Total: ${rows.length}`);
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
