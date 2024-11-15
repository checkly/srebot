import { checklyAggregator } from "./checkly-aggregator";
import { AlertDto } from "src/checkly/alertDTO";

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
}

export class CheckContextAggregator {
	alert: AlertDto;
	plugins = [checklyAggregator];

	constructor(alert: AlertDto) {
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
