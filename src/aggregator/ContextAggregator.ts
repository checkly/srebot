import { checklyAggregator } from "./checkly-aggregator";
import { WebhookAlertDto } from "../checkly/alertDTO";

export enum ContextKey {
	ChecklyScript = "checkly.script",
	ChecklyAlert = "checkly.alert",
	ChecklyCheck = "checkly.check",
	ChecklyResults = "checkly.results",
	ChecklyPrometheusStatus = "checkly.prometheusStatus",
	ChecklyLogs = "checkly.logs",
}

export interface CheckContext {
	checkId: string;
	source: "checkly";
	key: ContextKey;
	value: unknown;
	analysis: string;
}

export class CheckContextAggregator {
	alert: WebhookAlertDto;
	plugins = [checklyAggregator];

	constructor(alert: WebhookAlertDto) {
		this.alert = alert;
	}

	aggregate() {
		return Promise.all(
			this.plugins.map(async (plugin) => {
				return plugin.fetchContext(this.alert);
			})
		).then((results) => results.flat());
	}
}
