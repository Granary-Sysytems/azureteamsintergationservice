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

function formatActionConfirmation(data) {
  const actionTitle =
    data &&
    (typeof data.__actionTitle === "string"
      ? data.__actionTitle.trim()
      : typeof data.actionTitle === "string"
        ? data.actionTitle.trim()
        : "");
  const actionValue = data && typeof data.action === "string" ? data.action : null;
  const displayAction = actionTitle || actionValue;

  if (displayAction) {
    return `✅ Обрано: ${displayAction}`;
  }

  return "✅ Вашу відповідь зафіксовано.";
}

module.exports = {
  mapTenantId,
  createUpdate,
  formatActionConfirmation,
};
