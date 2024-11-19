import { checklyAggregator } from "./checkly-aggregator";
import { WebhookAlertDto } from "src/checkly/alertDTO";

export enum ContextKey {
	ChecklyAlert = "checkly.alert",
	ChecklyCheck = "checkly.check",
	ChecklyResults = "checkly.results",
	ChecklyPrometheusStatus = "checkly.prometheusStatus",
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
