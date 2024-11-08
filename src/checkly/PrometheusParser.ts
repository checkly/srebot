import { PrometheusMetric, PrometheusMetricValue } from './PrometheusMetric';

export class PrometheusParser {
  static parse(input: string): PrometheusMetric[] {
    const lines = input.split('\n');
    const metrics: PrometheusMetric[] = [];
    let currentMetric: PrometheusMetric | null = null;

    for (const line of lines) {
      if (line.startsWith('# HELP')) {
        const parts = line.split(' ');
        const metricName = parts[2];
        const help = parts.slice(3).join(' ');
        currentMetric = new PrometheusMetric(metricName, help, '');
        metrics.push(currentMetric);
      } else if (line.startsWith('# TYPE')) {
        const parts = line.split(' ');
        const metricName = parts[2];
        const type = parts[3];
        currentMetric = metrics.find(m => m.metricName === metricName) || null;
        if (currentMetric) {
          currentMetric.type = type;
        }
      } else if (line.trim() !== '') {
        const [metricPart, valuePart] = line.split(' ');
        const metricName = metricPart.split('{')[0];
        const labelsPart = metricPart.split('{')[1]?.split('}')[0];
        const labels = labelsPart
          ? Object.fromEntries(labelsPart.split(',').map(l => l.split('=').map(s => s.replace(/"/g, ''))))
          : {};
        const value = parseFloat(valuePart);

        currentMetric = metrics.find(m => m.metricName === metricName) || null;
        if (currentMetric) {
          currentMetric.addValue(new PrometheusMetricValue(labels, value));
        }
      }
    }

    return metrics;
  }
}