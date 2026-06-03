const test = require("node:test");
const assert = require("node:assert/strict");
const { createConversationStore } = require("../../src/services/conversationStore");

test("saveConversationReference writes by conversation and by target when target is provided", async () => {
  const upserts = [];
  const tableClient = {
    createTable: async () => {},
    upsertEntity: async (entity, mode) => {
      upserts.push({ entity, mode });
    },
    getEntity: async () => {
      throw new Error("not used");
    },
  };

  const store = createConversationStore(tableClient);
  const reference = {
    conversation: { id: "conversation 1" },
    serviceUrl: "https://example.invalid",
  };

  await store.saveConversationReference(reference, "target-a");

  assert.equal(upserts.length, 2);
  assert.equal(upserts[0].mode, "Replace");
  assert.equal(upserts[1].mode, "Replace");
  assert.equal(upserts[0].entity.rowKey, "conversationId:conversation%201");
  assert.equal(upserts[1].entity.rowKey, "target:target-a");
});

test("saveConversationReference ignores missing conversation id", async () => {
  let called = false;
  const tableClient = {
    createTable: async () => {},
    upsertEntity: async () => {
      called = true;
    },
    getEntity: async () => {
      throw new Error("not used");
    },
  };

  const store = createConversationStore(tableClient);
  await store.saveConversationReference({ conversation: {} });
  assert.equal(called, false);
});

test("getReferenceByConversationId returns parsed reference", async () => {
  const tableClient = {
    createTable: async () => {},
    upsertEntity: async () => {},
    getEntity: async (_pk, rowKey) => ({
      reference: JSON.stringify({ conversation: { id: rowKey } }),
    }),
    listEntities: () => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true }) }) }),
  };
  const store = createConversationStore(tableClient);

  const result = await store.getReferenceByConversationId("conv-1");
  assert.equal(result.conversation.id, "conversationId:conv-1");
});

test("getReferenceByConversationId falls back to threaded reference and rewrites conversation.id", async () => {
  const channelId = "19:abc@thread.tacv2";
  const threadedRowKey = `conversationId:${encodeURIComponent(`${channelId};messageid=42`)}`;
  const listCalls = [];
  const upserts = [];
  const tableClient = {
    createTable: async () => {},
    upsertEntity: async (entity, mode) => {
      upserts.push({ entity, mode });
    },
    getEntity: async () => {
      const err = new Error("not found");
      err.statusCode = 404;
      throw err;
    },
    listEntities: (options) => {
      listCalls.push(options);
      const entries = [
        {
          partitionKey: "teams",
          rowKey: threadedRowKey,
          reference: JSON.stringify({
            conversation: {
              id: `${channelId};messageid=42`,
              conversationType: "channel",
              isGroup: true,
              tenantId: "tenant-1",
            },
            activityId: "act-1",
            serviceUrl: "https://example.invalid",
          }),
        },
      ];
      return {
        [Symbol.asyncIterator]: () => {
          let i = 0;
          return {
            next: async () => {
              if (i >= entries.length) return { done: true, value: undefined };
              return { done: false, value: entries[i++] };
            },
          };
        },
      };
    },
  };

  const store = createConversationStore(tableClient);
  const result = await store.getReferenceByConversationId(channelId);

  assert.ok(result, "expected fallback reference");
  assert.equal(result.conversation.id, channelId);
  assert.equal(result.conversation.conversationType, "channel");
  assert.equal(result.conversation.isGroup, true);
  assert.equal(result.activityId, undefined);
  assert.equal(listCalls.length, 1);
  assert.match(
    listCalls[0].queryOptions.filter,
    /RowKey ge 'conversationId:19%3Aabc%40thread\.tacv2%3Bmessageid%3D'/,
  );
  assert.match(
    listCalls[0].queryOptions.filter,
    /RowKey lt 'conversationId:19%3Aabc%40thread\.tacv2%3Bmessageid%3D~'/,
  );
  assert.equal(upserts.length, 1);
  assert.equal(
    upserts[0].entity.rowKey,
    `conversationId:${encodeURIComponent(channelId)}`,
  );
});

test("getReferenceByConversationId returns null when neither exact nor threaded entry exists", async () => {
  const tableClient = {
    createTable: async () => {},
    upsertEntity: async () => {},
    getEntity: async () => {
      const err = new Error("not found");
      err.statusCode = 404;
      throw err;
    },
    listEntities: () => ({
      [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true }) }),
    }),
  };
  const store = createConversationStore(tableClient);
  const result = await store.getReferenceByConversationId("19:absent@thread.tacv2");
  assert.equal(result, null);
});

test("saveConversationReference writes only conversation index when no target provided", async () => {
  const upserts = [];
  const tableClient = {
    createTable: async () => {},
    upsertEntity: async (entity, mode) => {
      upserts.push({ entity, mode });
    },
    getEntity: async () => {
      throw new Error("not used");
    },
  };

  const store = createConversationStore(tableClient);
  const reference = {
    conversation: { id: "conversation-2" },
    serviceUrl: "https://example.invalid",
  };

  await store.saveConversationReference(reference);

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].entity.rowKey, "conversationId:conversation-2");
});

test("getReferenceByTarget requires explicit target and handles 404", async () => {
  const calls = [];
  const tableClient = {
    createTable: async () => {},
    upsertEntity: async () => {},
    getEntity: async (_pk, rowKey) => {
      calls.push(rowKey);
      const error = new Error("not found");
      error.statusCode = 404;
      throw error;
    },
  };

  const store = createConversationStore(tableClient);
  const missingTarget = await store.getReferenceByTarget();
  const result = await store.getReferenceByTarget("user-a");

  assert.equal(missingTarget, null);
  assert.equal(result, null);
  assert.deepEqual(calls, ["target:user-a"]);
});

test("saveReferenceByEmail writes normalized email index", async () => {
  const upserts = [];
  const tableClient = {
    createTable: async () => {},
    upsertEntity: async (entity, mode) => upserts.push({ entity, mode }),
    getEntity: async () => {
      throw new Error("not used");
    },
  };
  const store = createConversationStore(tableClient);
  await store.saveReferenceByEmail(
    { conversation: { id: "conv-email-1" }, serviceUrl: "https://example.invalid" },
    "Ihor.Neshyk@Ukroliya.com ",
  );

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].mode, "Replace");
  assert.equal(upserts[0].entity.rowKey, "email:ihor.neshyk%40ukroliya.com");
});

test("getReferenceByEmail returns null on 404 and parsed reference on hit", async () => {
  const tableClient = {
    createTable: async () => {},
    upsertEntity: async () => {},
    getEntity: async (_pk, rowKey) => {
      if (rowKey === "email:missing%40example.com") {
        const error = new Error("not found");
        error.statusCode = 404;
        throw error;
      }
      return { reference: JSON.stringify({ conversation: { id: "conv-email-2" } }) };
    },
  };
  const store = createConversationStore(tableClient);
  const missing = await store.getReferenceByEmail("missing@example.com");
  const found = await store.getReferenceByEmail("found@example.com");

  assert.equal(missing, null);
  assert.equal(found.conversation.id, "conv-email-2");
});

test("ensureConversationTableExists ignores 409 but throws others", async () => {
  const tableClient = {
    createTable: async () => {
      const err = new Error("exists");
      err.statusCode = 409;
      throw err;
    },
    upsertEntity: async () => {},
    getEntity: async () => ({}),
  };
  const store = createConversationStore(tableClient);
  await store.ensureConversationTableExists();

  const failingClient = {
    ...tableClient,
    createTable: async () => {
      const err = new Error("boom");
      err.statusCode = 500;
      throw err;
    },
  };
  const failingStore = createConversationStore(failingClient);
  await assert.rejects(() => failingStore.ensureConversationTableExists());
});
