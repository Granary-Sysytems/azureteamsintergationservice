class SendError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "SendError";
    this.statusCode = statusCode;
  }
}

module.exports = { SendError };
