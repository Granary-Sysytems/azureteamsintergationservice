const { MessageFactory } = require("botbuilder");
const { SendError } = require("./errors");

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

async function buildOutgoingActivity(
  { text, adaptiveCard, textFile },
  { uploadTextFile } = {},
) {
  if (!text && !adaptiveCard && !textFile) {
    throw new SendError(
      "Request must include `text`, `adaptiveCard`, or `textFile`.",
      400,
    );
  }

  const attachments = [];
  if (adaptiveCard) {
    attachments.push({
      contentType: "application/vnd.microsoft.card.adaptive",
      content: adaptiveCard,
    });
  }

  const normalizedTextFile = normalizeTextFile(textFile);
  if (normalizedTextFile) {
    if (typeof uploadTextFile === "function") {
      const uploadedFile = await uploadTextFile(normalizedTextFile);
      if (uploadedFile && uploadedFile.downloadUrl && uploadedFile.fileName) {
        const fileLink = `[${uploadedFile.fileName}](${uploadedFile.downloadUrl})`;
        text = `${text || ""}\n\nAttachment: ${fileLink}`.trim();
      }
    } else {
      const fallbackPreview = `\n\n---\nAttachment preview: ${normalizedTextFile.fileName}\n${normalizedTextFile.content}`;
      text = `${text || ""}${fallbackPreview}`.trim();
    }
  }

  const finalText = (text || "").trim() || undefined;

  if (attachments.length > 0) {
    return {
      type: "message",
      text: finalText,
      attachments,
    };
  }

  return MessageFactory.text(finalText);
}

module.exports = { buildOutgoingActivity };
