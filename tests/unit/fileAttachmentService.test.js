const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFileAttachmentService,
} = require("../../src/services/fileAttachmentService");

test("createFileAttachmentService validates connection string", () => {
  assert.throws(
    () => createFileAttachmentService({}),
    /storageConnectionString is required/,
  );

  assert.throws(
    () =>
      createFileAttachmentService({
        storageConnectionString: "DefaultEndpointsProtocol=https;AccountName=foo",
      }),
    /Invalid AZURE_STORAGE_CONNECTION_STRING/,
  );
});

test("uploadTextFile returns null for missing payload", async () => {
  const service = createFileAttachmentService(
    {
      storageConnectionString:
        "DefaultEndpointsProtocol=https;AccountName=acc;AccountKey=key;EndpointSuffix=core.windows.net",
    },
    {
      blobServiceClientFactory: () => ({
        getContainerClient: () => ({
          createIfNotExists: async () => {},
          getBlockBlobClient: () => ({
            url: "https://example.invalid/file.txt",
            uploadData: async () => {},
          }),
        }),
      }),
      createSharedKeyCredential: () => ({}),
      generateBlobSasQueryParameters: () => ({ toString: () => "sig=abc" }),
      createUuid: () => "uuid-1",
      now: () => 1700000000000,
    },
  );

  const result = await service.uploadTextFile(null);
  assert.equal(result, null);
});

test("uploadTextFile uploads content and returns signed url", async () => {
  let createContainerCalls = 0;
  let uploadPayload = null;
  let uploadedBlobName = null;

  const service = createFileAttachmentService(
    {
      storageConnectionString:
        "DefaultEndpointsProtocol=https;AccountName=acc;AccountKey=key;EndpointSuffix=core.windows.net",
      containerName: "my-container",
    },
    {
      blobServiceClientFactory: () => ({
        getContainerClient: (container) => {
          assert.equal(container, "my-container");
          return {
            createIfNotExists: async () => {
              createContainerCalls += 1;
            },
            getBlockBlobClient: (blobName) => {
              uploadedBlobName = blobName;
              return {
                url: "https://example.invalid/blob",
                uploadData: async (buffer) => {
                  uploadPayload = buffer.toString("utf8");
                },
              };
            },
          };
        },
      }),
      createSharedKeyCredential: () => ({}),
      generateBlobSasQueryParameters: (options) => {
        assert.equal(options.containerName, "my-container");
        return { toString: () => "sig=xyz" };
      },
      createUuid: () => "uuid-2",
      now: () => 1700000000000,
    },
  );

  const result = await service.uploadTextFile({
    fileName: "report",
    content: "hello file",
  });

  assert.equal(createContainerCalls, 1);
  assert.equal(uploadPayload, "hello file");
  assert.match(uploadedBlobName, /1700000000000-uuid-2-report\.txt/);
  assert.deepEqual(result, {
    fileName: "report.txt",
    downloadUrl: "https://example.invalid/blob?sig=xyz",
  });
});
