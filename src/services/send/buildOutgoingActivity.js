const { MessageFactory } = require("botbuilder");
const { SendError } = require("./errors");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseRequiredFields(existingData) {
  if (Array.isArray(existingData.requiredFields)) {
    return existingData.requiredFields
      .filter((field) => typeof field === "string")
      .map((field) => field.trim())
      .filter(Boolean);
  }

  if (
    existingData.requires &&
    typeof existingData.requires === "object" &&
    Array.isArray(existingData.requires.fields)
  ) {
    return existingData.requires.fields
      .filter((field) => typeof field === "string")
      .map((field) => field.trim())
      .filter(Boolean);
  }

  if (existingData.action === "reject_or_request_clarification") {
    return ["comment", "amount"];
  }

  return [];
}

function parseNumericFields(existingData, requiredFields) {
  if (Array.isArray(existingData.numericFields)) {
    return existingData.numericFields
      .filter((field) => typeof field === "string")
      .map((field) => field.trim())
      .filter(Boolean);
  }

  return requiredFields.filter((field) => field === "amount" || field === "price");
}

function enrichAdaptiveCard(adaptiveCard) {
  const card = cloneJson(adaptiveCard);
  const cardSnapshot = { ...card };
  delete cardSnapshot.actions;

  if (Array.isArray(card.actions)) {
    card.actions = card.actions.map((action) => {
      if (action && action.type === "Action.Submit") {
        const existingData =
          action.data && typeof action.data === "object" ? action.data : {};
        const requiredFields = parseRequiredFields(existingData);
        const numericFields = parseNumericFields(existingData, requiredFields);

        return {
          ...action,
          data: {
            ...existingData,
            __actionTitle:
              typeof action.title === "string" && action.title.trim()
                ? action.title.trim()
                : null,
            __originalCard: cardSnapshot,
            __requiredFields: requiredFields,
            __numericFields: numericFields,
            __amountRule:
              requiredFields.includes("amount") && existingData.amountRule
                ? existingData.amountRule
                : requiredFields.includes("amount")
                  ? "positive"
                  : null,
          },
        };
      }
      return action;
    });
  }

  return card;
}

function normalizeTextFile(textFile) {
  if (!textFile || typeof textFile !== "object") {
    return null;
  }

  const fileName =
    typeof textFile.fileName === "string" && textFile.fileName.trim()
      ? textFile.fileName.trim()
      : "note.txt";
  const content =
    typeof textFile.content === "string" ? textFile.content : String(textFile.content || "");

  if (!content.trim()) {
    throw new SendError("`textFile.content` must be a non-empty string.", 400);
  }

  return {
    fileName: fileName.endsWith(".txt") ? fileName : `${fileName}.txt`,
    content,
  };
}

function normalizeBase64File(base64File) {
  if (!base64File || typeof base64File !== "object") {
    return null;
  }

  const fileName =
    typeof base64File.fileName === "string" && base64File.fileName.trim()
      ? base64File.fileName.trim()
      : null;
  const contentType =
    typeof base64File.contentType === "string" && base64File.contentType.trim()
      ? base64File.contentType.trim()
      : null;
  const base64Body =
    typeof base64File.base64Body === "string" && base64File.base64Body.trim()
      ? base64File.base64Body.trim()
      : null;

  if (!fileName) {
    throw new SendError("`base64File.fileName` is required.", 400);
  }
  if (!contentType) {
    throw new SendError("`base64File.contentType` is required.", 400);
  }
  if (!base64Body) {
    throw new SendError("`base64File.base64Body` is required.", 400);
  }

  return { fileName, contentType, base64Body };
}

async function buildOutgoingActivity(
  { text, adaptiveCard, textFile, base64File },
  { uploadTextFile, uploadBinaryFile } = {},
) {
  if (!text && !adaptiveCard && !textFile && !base64File) {
    throw new SendError(
      "Request must include `text`, `adaptiveCard`, `textFile`, or `base64File`.",
      400,
    );
  }

  const attachments = [];
  const uploadedFiles = [];
  const linkLines = [];
  if (adaptiveCard) {
    attachments.push({
      contentType: "application/vnd.microsoft.card.adaptive",
      content: enrichAdaptiveCard(adaptiveCard),
    });
  }

  const normalizedTextFile = normalizeTextFile(textFile);
  if (normalizedTextFile) {
    if (typeof uploadTextFile === "function") {
      const uploadedFile = await uploadTextFile(normalizedTextFile);
      if (uploadedFile && uploadedFile.downloadUrl && uploadedFile.fileName) {
        uploadedFiles.push(uploadedFile);
        const fileLink = `[${uploadedFile.fileName}](${uploadedFile.downloadUrl})`;
        linkLines.push(`Attachment: ${fileLink}`);
      }
    } else {
      const fallbackPreview = `\n\n---\nAttachment preview: ${normalizedTextFile.fileName}\n${normalizedTextFile.content}`;
      text = `${text || ""}${fallbackPreview}`.trim();
    }
  }

  const normalizedBase64File = normalizeBase64File(base64File);
  if (normalizedBase64File) {
    if (typeof uploadBinaryFile === "function") {
      try {
        const uploadedFile = await uploadBinaryFile(normalizedBase64File);
        if (uploadedFile && uploadedFile.downloadUrl && uploadedFile.fileName) {
          uploadedFiles.push(uploadedFile);
          const fileLink = `[${uploadedFile.fileName}](${uploadedFile.downloadUrl})`;
          linkLines.push(`Attachment: ${fileLink}`);
        }
      } catch (error) {
        throw new SendError(error.message || "Failed to upload `base64File`.", 400);
      }
    } else {
      throw new SendError("`base64File` is not supported by this deployment.", 501);
    }
  }

  if (linkLines.length > 0) {
    text = `${text || ""}\n\n${linkLines.join("\n")}`.trim();
  }

  const finalText = (text || "").trim() || undefined;

  if (attachments.length > 0) {
    return {
      activity: {
        type: "message",
        text: finalText,
        attachments,
      },
      uploadedFiles,
    };
  }

  return {
    activity: MessageFactory.text(finalText),
    uploadedFiles,
  };
}

module.exports = { buildOutgoingActivity };
