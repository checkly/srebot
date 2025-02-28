import { createCanvas } from "canvas";
import * as echarts from "echarts";
import fs from "node:fs";
import { CheckResult } from "../checkly/models";

export const createHeatmap = (
  data: CheckResult[],
  bucketSizeInMinutes = 10,
) => {
  // 1. Group by runLocation + time bucket.
  //    We'll convert startedAt to an integer "bucket index" based on bucketSizeInMinutes.

  // Helper to round down a date to a bucket index
  const getBucketIndex = (dateStr): number => {
    const date = new Date(dateStr);
    const msInBucket = bucketSizeInMinutes * 60_000;
    return Math.floor(date.getTime() / msInBucket);
  };

  // Collect unique runLocations and bucket indices
  const groupedResults = {};
  const runLocationsSet = new Set();
  const bucketIndicesSet: Set<number> = new Set();

  data.forEach((entry) => {
    const bucketIndex = getBucketIndex(entry.startedAt);
    bucketIndicesSet.add(bucketIndex);
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

  // Sort the unique sets to get consistent x (time) and y (locations) ordering
  const bucketIndices = Array.from(bucketIndicesSet).sort((a, b) => a - b);
  const runLocations = Array.from(runLocationsSet).sort();

  // 2. Build the data array in the format [xIndex, yIndex, failRatio]
  //    Where xIndex corresponds to the time bucket, yIndex to runLocation, failRatio is fails/total.
  const heatmapData: [number, number, number?][] = [];
  bucketIndices.forEach((bIndex, xIdx) => {
    runLocations.forEach((loc, yIdx) => {
      const key = `${loc}__${bIndex}`;
      const group = groupedResults[key];
      const failRatio = group ? group.fails / group.total : undefined;
      heatmapData.push([xIdx, yIdx, failRatio]);
    });
  });

  // 3. Configure the ECharts option object
  //    X axis: time buckets
  //    Y axis: runLocations
  //    Heatmap color scale: from 0 (green) to 1 (red)
  const option = {
    title: {
      text: "Check Failures Percentage",
      left: "center",
    },
    animation: false,
    xAxis: {
      type: "category",
      data: bucketIndices.map((bIndex) => {
        // Convert bucket index back to a readable timestamp label
        const msInBucket = bucketSizeInMinutes * 60_000;
        const timeInMs = bIndex * msInBucket;
        const date = new Date(timeInMs);
        return date.toISOString().slice(0, 16); // e.g. "2025-02-27T12:50"
      }),
      splitArea: {
        show: true,
      },
    },
    yAxis: {
      type: "category",
      data: runLocations,
      splitArea: {
        show: true,
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
        color: ["#50fa7b", "#ff5555"], // green to red
      },
    },
    series: [
      {
        name: "Fail Ratio",
        type: "heatmap",
        data: heatmapData,
        label: {
          show: false,
          formatter: (params) => {
            // Show the fail ratio, formatted (e.g., "0.25")
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
  data,
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
  const width = 1200; // Image width
  const height = 150 * verticalSeries + 100; // Image height
  const canvas = createCanvas(width, height);
  const chart = echarts.init(canvas as any, null, {
    renderer: "canvas",
    width,
    height,
  });

  const option = createHeatmap(data, bucketSizeInMinutes);

  chart.setOption(option);

  const buffer = canvas.toBuffer("image/png");
  if (outputFilePath) {
    fs.writeFileSync(outputFilePath, buffer);
    console.log(`Chart saved to ${outputFilePath}`);
  }

  return buffer;
};
