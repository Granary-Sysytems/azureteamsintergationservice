const crypto = require("node:crypto");

const PARTITION_KEY = "teams";

function buildRowKey(token) {
  return `bindToken:${encodeURIComponent(token)}`;
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

class BindError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "BindError";
    this.statusCode = statusCode;
  }
}

function createBindService({
  tableClient,
  tokenTtlMs = 15 * 60 * 1000,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
} = {}) {
  if (!tableClient) {
    throw new Error("tableClient is required");
  }

  async function start(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      throw new BindError("`email` must be a valid email address.", 400);
    }

    const bindToken = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now() + tokenTtlMs).toISOString();
    await tableClient.upsertEntity(
      {
        partitionKey: PARTITION_KEY,
        rowKey: buildRowKey(bindToken),
        type: "bindToken",
        email: normalizedEmail,
        expiresAt,
        usedAt: "",
      },
      "Replace",
    );

    return { bindToken, email: normalizedEmail, expiresAt };
  }

  async function consume(bindToken) {
    if (!(typeof bindToken === "string" && bindToken.trim())) {
      return { ok: false, reason: "invalid" };
    }

    const token = bindToken.trim();
    let entity;
    try {
      entity = await tableClient.getEntity(PARTITION_KEY, buildRowKey(token));
    } catch (error) {
      if (error.statusCode === 404) {
        return { ok: false, reason: "not_found" };
      }
      throw error;
    }

    if (entity.usedAt) {
      return { ok: false, reason: "used", email: entity.email };
    }

    if (Date.parse(entity.expiresAt) <= now()) {
      return { ok: false, reason: "expired", email: entity.email };
    }

    await tableClient.upsertEntity(
      {
        ...entity,
        usedAt: new Date(now()).toISOString(),
      },
      "Replace",
    );

    return { ok: true, email: entity.email };
  }

  return { start, consume, normalizeEmail };
}

module.exports = { createBindService, BindError, normalizeEmail };
