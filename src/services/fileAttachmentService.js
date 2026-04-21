const crypto = require("node:crypto");
const path = require("node:path");
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

function normalizeTextFileName(fileName) {
  const candidate =
    typeof fileName === "string" && fileName.trim() ? fileName.trim() : "note.txt";
  return candidate.endsWith(".txt") ? candidate : `${candidate}.txt`;
}

function normalizeBinaryFileName(fileName) {
  const candidate =
    typeof fileName === "string" && fileName.trim() ? fileName.trim() : "attachment.bin";
  return path.basename(candidate);
}

function decodeBase64(base64Body) {
  const normalized = String(base64Body || "").trim();
  const withoutDataPrefix = normalized.includes(",")
    ? normalized.slice(normalized.indexOf(",") + 1)
    : normalized;
  const compact = withoutDataPrefix.replace(/\s+/g, "");

  if (!compact) {
    throw new Error("`base64File.base64Body` must be a non-empty base64 string.");
  }
  if (compact.length % 4 !== 0) {
    throw new Error("`base64File.base64Body` is not valid base64.");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new Error("`base64File.base64Body` is not valid base64.");
  }

  const buffer = Buffer.from(compact, "base64");
  if (!buffer.length) {
    throw new Error("`base64File.base64Body` decoded to empty content.");
  }
  return buffer;
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

  function createDownloadUrl(blobClient, blobName) {
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

    return `${blobClient.url}?${sas}`;
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

    const fileName = normalizeTextFileName(textFile.fileName);
    const blobName = `${now()}-${createUuid()}-${fileName}`;
    const blobClient = containerClient.getBlockBlobClient(blobName);

    await blobClient.uploadData(Buffer.from(content, "utf8"), {
      blobHTTPHeaders: {
        blobContentType: "text/plain; charset=utf-8",
      },
    });

    const downloadUrl = createDownloadUrl(blobClient, blobName);

    return { fileName, downloadUrl };
  }

  async function uploadBinaryFile(base64File) {
    if (!base64File || typeof base64File !== "object") {
      return null;
    }

    const contentType =
      typeof base64File.contentType === "string" && base64File.contentType.trim()
        ? base64File.contentType.trim()
        : null;
    if (!contentType) {
      throw new Error("`base64File.contentType` is required.");
    }

    const fileName = normalizeBinaryFileName(base64File.fileName);
    if (!fileName) {
      throw new Error("`base64File.fileName` is required.");
    }

    const binary = decodeBase64(base64File.base64Body);

    await ensureContainer();

    const blobName = `${now()}-${createUuid()}-${fileName}`;
    const blobClient = containerClient.getBlockBlobClient(blobName);
    await blobClient.uploadData(binary, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
    });

    return {
      fileName,
      contentType,
      downloadUrl: createDownloadUrl(blobClient, blobName),
    };
  }

  return { uploadTextFile, uploadBinaryFile };
}

module.exports = { createFileAttachmentService };
