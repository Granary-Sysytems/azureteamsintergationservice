const { createAdapter } = require("./createAdapter");
const { TeamsIntegrationBot } = require("./TeamsIntegrationBot");

function createBot(deps) {
  return new TeamsIntegrationBot(deps);
}

module.exports = { createAdapter, createBot };
