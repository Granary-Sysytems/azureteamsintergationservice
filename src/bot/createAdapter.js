const { BotFrameworkAdapter } = require("botbuilder");

function createAdapter({ botAppId, botAppPassword, botAppTenantId }) {
  const adapter = new BotFrameworkAdapter({
    appId: botAppId,
    appPassword: botAppPassword,
    channelAuthTenant: botAppTenantId || undefined,
  });

  adapter.onTurnError = async (turnContext, error) => {
    console.error("Bot error:", error);
    await turnContext.sendActivity("Bot encountered an error.");
  };

  return adapter;
}

module.exports = { createAdapter };
