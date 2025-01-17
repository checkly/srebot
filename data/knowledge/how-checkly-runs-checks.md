---
title: "How Checkly Runs Checks"
slug: "how-checkly-runs-checks"
summary: "This document provides an overview of how Checkly executes various types of checks, including API checks, browser checks, TCP checks, heartbeat checks, and multistep checks. It explains the execution process for each check type, discusses global locations and scheduling, and offers best practices for optimizing reliability."
created: "2025-01-16"
updated: "2025-01-16"
---
# How Checkly Executes Different Types of Checks

Checkly offers a comprehensive monitoring platform capable of executing various types of checks to ensure the reliability and performance of your applications and services. This document provides an overview of how Checkly runs different types of checks, including API checks, browser checks, TCP checks, heartbeat checks, and multistep checks.

## API Checks

API checks are designed to monitor your RESTful APIs by sending HTTP requests to specified endpoints and validating the responses. Checkly allows you to configure API checks with various settings, including request headers, query parameters, and authentication methods. You can also define assertions to validate the response status codes, headers, and body content.

**Execution Process:**

1. **Request Configuration:** The API check is configured with the necessary request details, such as the HTTP method, URL, headers, and body.

2. **Request Execution:** Checkly sends the HTTP request to the specified endpoint from the selected data center locations.

3. **Response Validation:** The response is evaluated against the defined assertions to determine if the check passes or fails.

4. **Result Storage:** The outcome of the check, including response times and any errors, is stored in Checkly's central database for reporting and alerting purposes.

5. **Special Feature:** Only API checks support setup and teardown scripts, allowing for more advanced pre-request and post-request configurations. Other check types do not have this capability.

## Browser Checks

Browser checks simulate real user interactions by running scripts in a headless browser environment. This allows you to monitor the functionality and performance of your web applications from the end-user's perspective. Checkly uses the Playwright framework to execute browser checks, enabling you to automate complex user scenarios.

**Execution Process:**

1. **Script Configuration:** A script is written using Playwright to define the user interactions, such as navigating to a page, clicking buttons, and filling out forms.

2. **Script Execution:** Checkly runs the script in a headless browser from the selected data center locations.

3. **Performance Monitoring:** During execution, Checkly collects performance metrics, such as load times and resource usage.

4. **Result Storage:** The results, including any errors encountered and performance data, are stored in Checkly's central database.

## TCP Checks

TCP checks allow you to monitor the availability of services that communicate over TCP by attempting to establish a connection to a specified host and port. This is useful for monitoring databases, mail servers, and other services that rely on TCP connections.

**Execution Process:**

1. **Connection Attempt:** Checkly attempts to establish a TCP connection to the specified host and port from the selected data center locations.

2. **Response Evaluation:** If the connection is successful, the check passes; otherwise, it fails.

3. **Result Storage:** The outcome of the check is recorded in Checkly's central database for reporting and alerting.

## Heartbeat Checks

Heartbeat checks are used to monitor scheduled or background tasks by expecting periodic pings from your applications. If Checkly does not receive a ping within the expected timeframe, it triggers an alert, indicating a potential issue with the task.

**Execution Process:**

1. **Ping Expectation:** A heartbeat check is configured with an expected interval for receiving pings.

2. **Ping Reception:** Your application sends HTTP requests (pings) to Checkly's endpoint at the configured intervals.

3. **Timeout Monitoring:** Checkly monitors the intervals between pings. If a ping is not received within the expected timeframe, the check fails.

4. **Result Storage:** The status of the heartbeat check is stored in Checkly's central database.

## Multistep Checks

Multistep checks allow you to perform a series of HTTP requests in a specific sequence, making it possible to monitor complex workflows and transactions. Each step can have its own assertions, and data can be passed between steps to simulate real-world scenarios.

**Execution Process:**

1. **Step Configuration:** Multiple HTTP requests are defined in a specific sequence, with each step configured with its own request details and assertions.

2. **Sequential Execution:** Checkly executes each step in order, using data from previous steps as needed.

3. **Response Validation:** Each step's response is validated against its assertions to determine if it passes or fails.

4. **Result Storage:** The outcomes of all steps are stored in Checkly's central database, providing detailed insights into each part of the workflow.

## Global Locations and Scheduling

Checkly allows you to run checks from multiple global locations to monitor your services' performance and availability from different regions. You can configure the frequency of checks and select specific data center locations to execute them.

**Execution Process:**

1. **Location Selection:** Choose one or more data center locations from which the checks will be executed.

2. **Scheduling:** Configure the frequency at which each check should run, ranging from every few seconds to once a day.

3. **Distributed Execution:** Checkly executes the checks from the selected locations according to the configured schedule.

4. **Result Aggregation:** Results from all locations are aggregated and stored in Checkly's central database for analysis and alerting.

## Optimizing Reliability

To ensure the reliability of your monitoring setup, consider the following best practices:

- **Multiple Locations:** Run checks from multiple locations to detect regional issues and improve redundancy.

- **Retry Logic:** Configure retries for checks to reduce false positives caused by transient network issues.

- **Alerting Thresholds:** Set appropriate alerting thresholds to balance sensitivity and noise.

- **Maintenance Windows:** Define maintenance windows to suppress alerts during planned outages or deployments.

By implementing these practices, you can enhance the effectiveness of your monitoring and ensure timely detection of issues.

For more detailed information, refer to Checkly's official documentation:

- [How Checkly Runs Checks](https://www.checklyhq.com/docs/monitoring/)

- [Global Locations & Scheduling Strategies](https://www.checklyhq.com/docs/monitoring/global-locations/)

- [Optimizing Your Monitoring for Reliability](https://www.checklyhq.com/docs/monitoring/optimizing-reliability/)

- [Check Results](https://www.checklyhq.com/docs/monitoring/check-results/)

- [API Checks](https://www.checklyhq.com/docs/api-checks/)

- [Browser Checks](https://www.checklyhq.com/docs/browser-checks/)

- [TCP Checks](https://www.checklyhq.com/docs/tcp-checks/)

- [Heartbeat Checks](https://www.checklyhq.com/docs/heartbeat-checks/)

- [Multistep Checks](https://www.checklyhq.com/docs/multistep-checks/)

---

This document provides an overview of how Checkly executes different types of checks, offering insights into their execution processes and best practices for optimizing reliability. For comprehensive details, please refer to the official Checkly documentation linked above.
