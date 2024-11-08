export class PrometheusMetric {
    metricName: string;
    help: string;
    type: string;
    values: PrometheusMetricValue[];
  
    constructor(metricName: string, help: string, type: string) {
      this.metricName = metricName;
      this.help = help;
      this.type = type;
      this.values = [];
    }
  
    addValue(value: PrometheusMetricValue) {
      this.values.push(value);
    }
  }
  
  export class PrometheusMetricValue {
    labels: { [key: string]: string };
    value: number;
  
    constructor(labels: { [key: string]: string }, value: number) {
      this.labels = labels;
      this.value = value;
    }
  }