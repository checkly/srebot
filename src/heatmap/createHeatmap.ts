import { createCanvas } from "canvas";
import * as echarts from "echarts";
import fs from "node:fs";
import { CheckResult } from "../checkly/models";
import { CheckResultTable } from "../db/check-results";

export const createHeatmap = (
  data: CheckResultTable[] | CheckResult[],
  bucketSizeInMinutes = 30, // Updated to 30-minute intervals
  from: Date,
  to: Date,
) => {
  // Helper to get a bucket index from a date
  const getBucketIndex = (date: Date) => {
    const msInBucket = bucketSizeInMinutes * 60_000;
    return Math.floor(date.getTime() / msInBucket);
  };

  // Convert 'from' and 'to' to bucket indices
  const fromBucket = getBucketIndex(from);
  const toBucket = getBucketIndex(to);

  // Collect unique runLocations
  const groupedResults = {};
  const runLocationsSet = new Set();

  data.forEach((entry) => {
    const bucketIndex = getBucketIndex(entry.startedAt);
    if (bucketIndex < fromBucket || bucketIndex > toBucket) return; // Ignore out-of-range data

    runLocationsSet.add(entry.runLocation);

    const key = `${entry.runLocation}__${bucketIndex}`;
    if (!groupedResults[key]) {
      groupedResults[key] = {
        total: 0,
        fails: 0,
      };
    }
    groupedResults[key].total += 1;
    if (entry.hasErrors || entry.hasFailures) {
      groupedResults[key].fails += 1;
    }
  });

  // Generate all time buckets within the range
  const bucketIndices: number[] = [];
  for (let i = fromBucket; i < toBucket; i++) {
    bucketIndices.push(i);
  }

  const runLocations = Array.from(runLocationsSet).sort();

  // Build the heatmap data array
  const heatmapData: [number, number, number?][] = [];
  bucketIndices.forEach((bIndex, xIdx) => {
    runLocations.forEach((loc, yIdx) => {
      const key = `${loc}__${bIndex}`;
      const group = groupedResults[key];
      const failRatio = group ? group.fails / group.total : undefined;
      heatmapData.push([xIdx, yIdx, failRatio]);
    });
  });

  // Generate human-readable labels for the x-axis
  const xLabels = bucketIndices.map((bIndex) => {
    const msInBucket = bucketSizeInMinutes * 60_000;
    const timeInMs = bIndex * msInBucket;
    const date = new Date(timeInMs);
    return date.toISOString().slice(0, 16).replace("T", "  "); // Format: "YYYY-MM-DD HH:mm"
  });

  // ECharts heatmap configuration
  const option = {
    title: {
      text: "Check Failures Percentage",
      left: "center",
    },
    backgroundColor: "#FFFFFF",
    grid: {
      left: "180px",
      right: "100px",
      bottom: "150px",
      top: "50px",
    },
    animation: false,
    xAxis: {
      type: "category",
      data: xLabels,
      splitArea: {
        show: true,
      },
      axisLabel: {
        rotate: 90,
        interval: 0,
        align: "right",
        verticalAlign: "middle",
        fontSize: 15,
        color: "#000000",
      },
    },
    yAxis: {
      type: "category",
      data: runLocations,
      splitArea: {
        show: true,
      },
      axisLabel: {
        color: "#000000",
        fontSize: 20,
      },
    },
    visualMap: {
      min: 0,
      max: 1,
      calculable: true,
      orient: "vertical",
      left: "right",
      top: "middle",
      inRange: {
        color: ["#50fa7b", "#ff5555"],
      },
    },
    series: [
      {
        name: "Fail Ratio",
        type: "heatmap",
        data: heatmapData,
        label: {
          show: true,
          formatter: (params) => {
            return params.value[2].toFixed(2);
          },
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      },
    ],
  };

  return option;
};

export const generateHeatmapPNG = (
  data: CheckResultTable[] | CheckResult[],
  from: Date,
  to: Date,
  {
    outputFilePath,
    bucketSizeInMinutes = 10,
    verticalSeries = 3,
  }: {
    outputFilePath?: string;
    bucketSizeInMinutes: number;
    verticalSeries: number;
  },
) => {
  const width = 2000; // Image width
  const height = 45 * verticalSeries + 200; // Image height
  const canvas = createCanvas(width, height);
  const chart = echarts.init(canvas as any, null, {
    renderer: "canvas",
    width,
    height,
  });

  const option = createHeatmap(data, bucketSizeInMinutes, from, to);

  chart.setOption(option);

  const buffer = canvas.toBuffer("image/png");
  if (outputFilePath) {
    fs.writeFileSync(outputFilePath, buffer);
    console.log(`Chart saved to ${outputFilePath}`);
  }

  return buffer;
};
