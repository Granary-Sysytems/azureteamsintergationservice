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

const OFFICE_VIEWER_EXTENSIONS = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

function buildViewUrl(downloadUrl, fileName) {
  if (typeof downloadUrl !== "string" || !downloadUrl) {
    return null;
  }

  const ext = String(fileName || "")
    .split(".")
    .pop()
    .toLowerCase();

  if (!OFFICE_VIEWER_EXTENSIONS.has(ext)) {
    return null;
  }

  return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(
    downloadUrl,
  )}`;
}

function buildContentDisposition(fileName, disposition = "inline") {
  const asciiFallback = String(fileName || "file")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(String(fileName || "file"));
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
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
  editableLinks = true,
  accessPolicyId = null,
  sasTtlMs = 30 * 24 * 60 * 60 * 1000,
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
  const parseSasPermissions =
    deps.parseBlobSasPermissions || BlobSASPermissions.parse;
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
    const policyId =
      typeof accessPolicyId === "string" && accessPolicyId.trim()
        ? accessPolicyId.trim()
        : null;

    let sasOptions;
    if (policyId) {
      // Permissions and expiry are governed by the stored access policy in Azure.
      sasOptions = {
        containerName,
        blobName,
        identifier: policyId,
      };
    } else {
      const permissionSet = editableLinks ? "rw" : "r";
      sasOptions = {
        containerName,
        blobName,
        permissions: parseSasPermissions(permissionSet),
        startsOn: new Date(now() - 5 * 60 * 1000),
        expiresOn: new Date(now() + sasTtlMs),
      };
    }

    const sas = createSas(sasOptions, sharedKeyCredential).toString();

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
        blobContentDisposition: buildContentDisposition(fileName),
      },
    });

    const downloadUrl = createDownloadUrl(blobClient, blobName);

    return { fileName, downloadUrl, viewUrl: buildViewUrl(downloadUrl, fileName) };
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
        blobContentDisposition: buildContentDisposition(fileName),
      },
    });

    const downloadUrl = createDownloadUrl(blobClient, blobName);

    return {
      fileName,
      contentType,
      downloadUrl,
      viewUrl: buildViewUrl(downloadUrl, fileName),
    };
  }

  return { uploadTextFile, uploadBinaryFile };
}

module.exports = { createFileAttachmentService };
