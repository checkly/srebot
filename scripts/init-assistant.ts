import { getOpenaiClient } from "../src/ai/openai";

const openai = getOpenaiClient();

function createAssistant(name: string) {
	return openai.beta.assistants.create({
		model: "gpt-4o",
		name,
	});
}

async function main() {
	const assistants = await openai.beta.assistants.list();

	if (!assistants.data.length) {
		console.log("Creating sre-assistant");
		await createAssistant("sre-assistant");
	} else {
		const sreAssistant = assistants.data.find(
			(assistant) => assistant.name === "sre-assistant"
		);
		if (!sreAssistant) {
			console.log("Creating sre-assistant");
			await createAssistant("sre-assistant");
		} else {
			console.log("sre-assistant already exists: ", sreAssistant.id);
		}
	}
}

main()
	.then(() => {
		console.log("Done");
	})
	.catch((error) => {
		console.error(error);
	});
