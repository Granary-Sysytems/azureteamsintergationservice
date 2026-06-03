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
  let uploadedHeaders = null;
  const parsedPermissions = [];

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
                uploadData: async (buffer, options) => {
                  uploadPayload = buffer.toString("utf8");
                  uploadedHeaders = options?.blobHTTPHeaders;
                },
              };
            },
          };
        },
      }),
      createSharedKeyCredential: () => ({}),
      parseBlobSasPermissions: (permissions) => {
        parsedPermissions.push(permissions);
        return { permissions };
      },
      generateBlobSasQueryParameters: (options) => {
        assert.equal(options.containerName, "my-container");
        assert.deepEqual(options.permissions, { permissions: "rw" });
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
  assert.deepEqual(parsedPermissions, ["rw"]);
  assert.deepEqual(uploadedHeaders, {
    blobContentType: "text/plain; charset=utf-8",
    blobContentDisposition:
      "inline; filename=\"report.txt\"; filename*=UTF-8''report.txt",
  });
  assert.match(uploadedBlobName, /1700000000000-uuid-2-report\.txt/);
  assert.deepEqual(result, {
    fileName: "report.txt",
    downloadUrl: "https://example.invalid/blob?sig=xyz",
    viewUrl: null,
  });
});

test("uploadBinaryFile uploads bytes and returns signed url", async () => {
  let uploadedBuffer = null;
  let uploadedBlobName = null;
  let uploadedHeaders = null;
  const parsedPermissions = [];

  const service = createFileAttachmentService(
    {
      storageConnectionString:
        "DefaultEndpointsProtocol=https;AccountName=acc;AccountKey=key;EndpointSuffix=core.windows.net",
      containerName: "my-container",
    },
    {
      blobServiceClientFactory: () => ({
        getContainerClient: () => ({
          createIfNotExists: async () => {},
          getBlockBlobClient: (blobName) => {
            uploadedBlobName = blobName;
            return {
              url: "https://example.invalid/blob-binary",
              uploadData: async (buffer, options) => {
                uploadedBuffer = buffer;
                uploadedHeaders = options?.blobHTTPHeaders;
              },
            };
          },
        }),
      }),
      createSharedKeyCredential: () => ({}),
      parseBlobSasPermissions: (permissions) => {
        parsedPermissions.push(permissions);
        return { permissions };
      },
      generateBlobSasQueryParameters: () => ({ toString: () => "sig=binary" }),
      createUuid: () => "uuid-3",
      now: () => 1700000000000,
    },
  );

  const result = await service.uploadBinaryFile({
    fileName: "folder/invoice.pdf",
    contentType: "application/pdf",
    base64Body: Buffer.from("pdf-content").toString("base64"),
  });

  assert.match(uploadedBlobName, /1700000000000-uuid-3-invoice\.pdf/);
  assert.deepEqual(parsedPermissions, ["rw"]);
  assert.equal(uploadedBuffer.toString("utf8"), "pdf-content");
  assert.deepEqual(uploadedHeaders, {
    blobContentType: "application/pdf",
    blobContentDisposition:
      "inline; filename=\"invoice.pdf\"; filename*=UTF-8''invoice.pdf",
  });
  assert.deepEqual(result, {
    fileName: "invoice.pdf",
    contentType: "application/pdf",
    downloadUrl: "https://example.invalid/blob-binary?sig=binary",
    viewUrl: null,
  });
});

test("uploadBinaryFile returns office viewer url for office documents", async () => {
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
            url: "https://example.invalid/blob-docx",
            uploadData: async () => {},
          }),
        }),
      }),
      createSharedKeyCredential: () => ({}),
      parseBlobSasPermissions: (permissions) => ({ permissions }),
      generateBlobSasQueryParameters: () => ({ toString: () => "sig=docx" }),
      createUuid: () => "uuid-docx",
      now: () => 1700000000000,
    },
  );

  const result = await service.uploadBinaryFile({
    fileName: "Договір.docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    base64Body: Buffer.from("x").toString("base64"),
  });

  const directUrl = "https://example.invalid/blob-docx?sig=docx";
  assert.equal(result.downloadUrl, directUrl);
  assert.equal(
    result.viewUrl,
    `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(
      directUrl,
    )}`,
  );
});

test("uploadBinaryFile encodes non-ascii file names for content-disposition", async () => {
  let uploadedHeaders = null;
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
            url: "https://example.invalid/blob-cyrillic",
            uploadData: async (_buffer, options) => {
              uploadedHeaders = options?.blobHTTPHeaders;
            },
          }),
        }),
      }),
      createSharedKeyCredential: () => ({}),
      parseBlobSasPermissions: (permissions) => ({ permissions }),
      generateBlobSasQueryParameters: () => ({ toString: () => "sig=cyr" }),
      createUuid: () => "uuid-cyr",
      now: () => 1700000000000,
    },
  );

  await service.uploadBinaryFile({
    fileName: "Наказ №6.pdf",
    contentType: "application/pdf",
    base64Body: Buffer.from("pdf").toString("base64"),
  });

  const disposition = uploadedHeaders.blobContentDisposition;
  assert.match(disposition, /^inline; filename="/);
  assert.match(disposition, /filename\*=UTF-8''/);
  assert.match(disposition, new RegExp(encodeURIComponent("Наказ №6.pdf")));
  // ASCII fallback must not contain raw non-ascii bytes
  const fallback = disposition.match(/filename="([^"]*)"/)[1];
  assert.ok(/^[\x20-\x7E]*$/.test(fallback));
});

test("uploadBinaryFile uses stored access policy identifier when configured", async () => {
  let sasOptions = null;
  const service = createFileAttachmentService(
    {
      storageConnectionString:
        "DefaultEndpointsProtocol=https;AccountName=acc;AccountKey=key;EndpointSuffix=core.windows.net",
      containerName: "teams-attachments",
      accessPolicyId: "bot-readonly",
    },
    {
      blobServiceClientFactory: () => ({
        getContainerClient: () => ({
          createIfNotExists: async () => {},
          getBlockBlobClient: () => ({
            url: "https://example.invalid/blob-policy",
            uploadData: async () => {},
          }),
        }),
      }),
      createSharedKeyCredential: () => ({}),
      parseBlobSasPermissions: () => {
        throw new Error("permissions must not be parsed when policy id is used");
      },
      generateBlobSasQueryParameters: (options) => {
        sasOptions = options;
        return { toString: () => "sig=policy" };
      },
      createUuid: () => "uuid-policy",
      now: () => 1700000000000,
    },
  );

  const result = await service.uploadBinaryFile({
    fileName: "doc.pdf",
    contentType: "application/pdf",
    base64Body: Buffer.from("x").toString("base64"),
  });

  assert.equal(sasOptions.identifier, "bot-readonly");
  assert.equal(sasOptions.permissions, undefined);
  assert.equal(sasOptions.expiresOn, undefined);
  assert.equal(result.downloadUrl, "https://example.invalid/blob-policy?sig=policy");
});

test("uploadTextFile can keep read-only links when editable mode disabled", async () => {
  const parsedPermissions = [];
  const service = createFileAttachmentService(
    {
      storageConnectionString:
        "DefaultEndpointsProtocol=https;AccountName=acc;AccountKey=key;EndpointSuffix=core.windows.net",
      editableLinks: false,
    },
    {
      blobServiceClientFactory: () => ({
        getContainerClient: () => ({
          createIfNotExists: async () => {},
          getBlockBlobClient: () => ({
            url: "https://example.invalid/blob",
            uploadData: async () => {},
          }),
        }),
      }),
      createSharedKeyCredential: () => ({}),
      parseBlobSasPermissions: (permissions) => {
        parsedPermissions.push(permissions);
        return { permissions };
      },
      generateBlobSasQueryParameters: () => ({ toString: () => "sig=readonly" }),
      createUuid: () => "uuid-4",
      now: () => 1700000000000,
    },
  );

  await service.uploadTextFile({
    fileName: "readonly.txt",
    content: "readonly",
  });

  assert.deepEqual(parsedPermissions, ["r"]);
});

test("uploadBinaryFile validates required fields", async () => {
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
            url: "https://example.invalid/blob",
            uploadData: async () => {},
          }),
        }),
      }),
      createSharedKeyCredential: () => ({}),
      generateBlobSasQueryParameters: () => ({ toString: () => "sig=1" }),
    },
  );

  await assert.rejects(
    () =>
      service.uploadBinaryFile({
        fileName: "invoice.pdf",
        contentType: "application/pdf",
        base64Body: "not-valid-base64",
      }),
    /not valid base64/,
  );
});
