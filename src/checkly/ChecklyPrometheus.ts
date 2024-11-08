import { PrometheusParser } from './PrometheusParser';

export async function getChecklyPrometheus() {
    const url = `https://api.checklyhq.com/accounts/${process.env.CHECKLY_ACCOUNT_ID}/v2/prometheus/metrics`;
    const apiKey = process.env.PROMETHEUS_INTEGRATION_KEY;
  
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const text = await response.text();
      const checks = PrometheusParser.parse(text);
      return checks;
    } catch (error) {
      console.error('Error fetching Prometheus metrics:', error);
      throw error;
    }
  }