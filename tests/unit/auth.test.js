const test = require("node:test");
const assert = require("node:assert/strict");
const { createBearerAuth } = require("../../src/middleware/auth");

function createMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

test("rejects when authorization header is missing", () => {
  const middleware = createBearerAuth("token-123");
  const req = { headers: {} };
  const res = createMockRes();
  let called = false;

  middleware(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: "Unauthorized" });
});

test("allows request with valid bearer token", () => {
  const middleware = createBearerAuth("token-123");
  const req = { headers: { authorization: "Bearer token-123" } };
  const res = createMockRes();
  let called = false;

  middleware(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});
