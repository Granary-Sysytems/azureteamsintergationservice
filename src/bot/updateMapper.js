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
  const actionValue = data && typeof data.action === "string" ? data.action : null;
  if (!actionValue) {
    return "✅ Вашу відповідь зафіксовано.";
  }

  return `✅ Обрано: ${actionValue}`;
}

module.exports = { mapTenantId, createUpdate, formatActionConfirmation };
