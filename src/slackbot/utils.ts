export const getThreadMetadata = async (messages: any[]) => {
	let threadId, alertId;

	if (messages && messages.length > 0) {
		const firstBotMessage = messages.find((msg) => msg.bot_id);
		if (firstBotMessage) {
			const metadata = firstBotMessage.metadata?.event_payload as {
				threadId: string;
				alertId: string;
			};
			threadId = metadata?.threadId;
			alertId = metadata?.alertId;
		}
	}

	return { threadId, alertId };
};
