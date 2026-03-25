function createBearerAuth(expectedToken) {
  if (!expectedToken) {
    throw new Error("expectedToken is required");
  }

  return function bearerAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token || token !== expectedToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    return next();
  };
}

module.exports = { createBearerAuth };
