const {
  ActivityHandler,
  BotFrameworkAdapter,
  TurnContext,
} = require("botbuilder");

function mapTenantId(activity) {
  return (
    activity.conversation?.tenantId || activity.channelData?.tenant?.id || null
  );
}

function createUpdate(activity, type, data) {
  return {
    ts: new Date().toISOString(),
    type,
    activityId: activity.id || null,
    from: {
      id: activity.from?.id || null,
      name: activity.from?.name || null,
    },
    tenantId: mapTenantId(activity),
    conversationId: activity.conversation?.id || null,
    data: data || {},
  };
}

class TeamsIntegrationBot extends ActivityHandler {
  constructor({ enqueueUpdate, saveConversationReference }) {
    super();
    this.enqueueUpdate = enqueueUpdate;
    this.saveConversationReference = saveConversationReference;

    this.onMessage(async (context, next) => {
      const hasCardPayload = Boolean(context.activity.value);

      if (hasCardPayload) {
        const update = createUpdate(
          context.activity,
          "card.submit",
          context.activity.value,
        );
        await this.enqueueUpdate(update);
      }

      await context.sendActivity("OK");
      await next();
    });
  }

  async run(context) {
    const reference = TurnContext.getConversationReference(context.activity);
    await this.saveConversationReference(reference);
    await super.run(context);
  }

  async onInvokeActivity(context) {
    if (context.activity.name === "adaptiveCard/action") {
      const data = context.activity.value?.action?.data || context.activity.value;
      const update = createUpdate(context.activity, "card.execute", data);
      await this.enqueueUpdate(update);
    }

    return { status: 200 };
  }
}

function createAdapter({ botAppId, botAppPassword }) {
  const adapter = new BotFrameworkAdapter({
    appId: botAppId,
    appPassword: botAppPassword,
  });

  adapter.onTurnError = async (turnContext, error) => {
    console.error("Bot error:", error);
    await turnContext.sendActivity("Bot encountered an error.");
  };

  return adapter;
}

function createBot(deps) {
  return new TeamsIntegrationBot(deps);
}

module.exports = { createAdapter, createBot };
