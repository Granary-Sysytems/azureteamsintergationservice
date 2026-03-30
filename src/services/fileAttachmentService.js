const crypto = require("node:crypto");
const {
  BlobServiceClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} = require("@azure/storage-blob");

function parseConnectionString(connectionString) {
  const map = {};
  for (const part of String(connectionString || "").split(";")) {
    const [rawKey, ...rest] = part.split("=");
    if (!rawKey || rest.length === 0) {
      continue;
    }
    map[rawKey] = rest.join("=");
  }
  return map;
}

function normalizeFileName(fileName) {
  const candidate =
    typeof fileName === "string" && fileName.trim() ? fileName.trim() : "note.txt";
  return candidate.endsWith(".txt") ? candidate : `${candidate}.txt`;
}

function createFileAttachmentService({
  storageConnectionString,
  containerName = "teams-attachments",
}, deps = {}) {
  if (!storageConnectionString) {
    throw new Error("storageConnectionString is required");
  }

  const parsed = parseConnectionString(storageConnectionString);
  const accountName = parsed.AccountName;
  const accountKey = parsed.AccountKey;
  if (!accountName || !accountKey) {
    throw new Error("Invalid AZURE_STORAGE_CONNECTION_STRING");
  }

  const blobClientFactory =
    deps.blobServiceClientFactory || BlobServiceClient.fromConnectionString;
  const createSharedKeyCredential =
    deps.createSharedKeyCredential ||
    ((name, key) => new StorageSharedKeyCredential(name, key));
  const createSas =
    deps.generateBlobSasQueryParameters || generateBlobSASQueryParameters;
  const createUuid = deps.createUuid || crypto.randomUUID;
  const now = deps.now || (() => Date.now());

  const blobServiceClient = blobClientFactory(
    storageConnectionString,
  );
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const sharedKeyCredential = createSharedKeyCredential(accountName, accountKey);

  let isContainerReady = false;
  async function ensureContainer() {
    if (!isContainerReady) {
      await containerClient.createIfNotExists();
      isContainerReady = true;
    }
  }

  async function uploadTextFile(textFile) {
    if (!textFile || typeof textFile !== "object") {
      return null;
    }

    const content =
      typeof textFile.content === "string" ? textFile.content : String(textFile.content || "");
    if (!content.trim()) {
      throw new Error("`textFile.content` must be a non-empty string.");
    }

    await ensureContainer();

    const fileName = normalizeFileName(textFile.fileName);
    const blobName = `${now()}-${createUuid()}-${fileName}`;
    const blobClient = containerClient.getBlockBlobClient(blobName);

    await blobClient.uploadData(Buffer.from(content, "utf8"), {
      blobHTTPHeaders: {
        blobContentType: "text/plain; charset=utf-8",
      },
    });

    const expiresOn = new Date(now() + 60 * 60 * 1000);
    const sas = createSas(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse("r"),
        startsOn: new Date(now() - 5 * 60 * 1000),
        expiresOn,
      },
      sharedKeyCredential,
    ).toString();

    const downloadUrl = `${blobClient.url}?${sas}`;

    return { fileName, downloadUrl };
  }

  return { uploadTextFile };
}

module.exports = { createFileAttachmentService };
