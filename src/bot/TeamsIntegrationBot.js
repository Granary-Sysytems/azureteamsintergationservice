const { ActivityHandler, TurnContext } = require("botbuilder");
const { createUpdate, formatActionConfirmation } = require("./updateMapper");

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
        await context.sendActivity(formatActionConfirmation(context.activity.value));
      } else {
        await context.sendActivity("OK");
      }
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

module.exports = { TeamsIntegrationBot };
