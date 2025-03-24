import { CheckResultTable } from "../../db/check-results";
import {
  analyseDegradationAndRetriesTimeline,
  DegradationAndRetriesTimeline,
} from "../../prompts/checkly";
import { generateObject } from "ai";

const prepareData = (
  checkResults: CheckResultTable[],
  interval: { from: Date; to: Date },
): {
  buckets: DegradationAndRetriesTimeline;
  totalAttempts: number;
  totalDegraded: number;
} => {
  const bucketSizeMinutes = 30;

  // Step 1: Get all unique regions
  const allLocationsSet = new Set(
    checkResults.map((result) => result.runLocation),
  );
  const allLocations = Array.from(allLocationsSet);

  // Step 2: Create buckets between interval.from and interval.to
  const buckets: Record<
    string,
    { region: string; degraded: 0; retries: 0; failures: 0 }[]
  > = {};
  const bucketStart = new Date(interval.from.getTime());

  while (bucketStart < interval.to) {
    const bucketTime = new Date(bucketStart);
    bucketTime.setMinutes(
      Math.floor(bucketTime.getMinutes() / bucketSizeMinutes) *
        bucketSizeMinutes,
      0,
      0,
    );
    const bucketKey = bucketTime.toISOString();
    // Initialize each bucket with all regions set to zero
    buckets[bucketKey] = allLocations.map((region) => ({
      region,
      degraded: 0,
      retries: 0,
      failures: 0,
    }));
    bucketStart.setMinutes(bucketStart.getMinutes() + bucketSizeMinutes);
  }

  let totalAttempts = 0;
  let totalDegraded = 0;

  // Step 3: Populate buckets
  checkResults.forEach((result) => {
    const time = result.startedAt;
    const bucketTime = new Date(time);
    bucketTime.setMinutes(
      Math.floor(bucketTime.getMinutes() / bucketSizeMinutes) *
        bucketSizeMinutes,
      0,
      0,
    );
    const bucketKey = bucketTime.toISOString();

    if (!buckets[bucketKey]) return; // Skip if outside interval

    const regionData = buckets[bucketKey].find(
      (r) => r.region === result.runLocation,
    );
    if (regionData) {
      if (result.isDegraded) {
        regionData.degraded += 1;
        totalDegraded += 1;
      }
      if (result.resultType === "ATTEMPT") {
        regionData.retries += 1;
        totalAttempts += 1;
      }
      if (
        result.resultType === "FINAL" &&
        (result.hasErrors || result.hasFailures)
      ) {
        regionData.failures += 1;
      }
    }
  });

  // Step 4: Convert buckets to desired output format
  const data = Object.entries(buckets).map(([period, data]) => ({
    period: new Date(period),
    data,
  }));

  return {
    buckets: data,
    totalAttempts,
    totalDegraded,
  };
};

export const analyseRetriesAndDegradations = async (
  checkResults: CheckResultTable[],
  interval: {
    from: Date;
    to: Date;
  },
): Promise<{ degradationsAnalysis?: string; retriesAnalysis?: string }> => {
  const { buckets, totalAttempts, totalDegraded } = prepareData(
    checkResults,
    interval,
  );

  if (totalDegraded === 0 && totalAttempts === 0) {
    return {};
  }

  const response = await generateObject(
    analyseDegradationAndRetriesTimeline(buckets, totalAttempts, totalDegraded),
  );

  const result: { degradationsAnalysis?: string; retriesAnalysis?: string } =
    {};
  if (totalDegraded > 0) {
    result.degradationsAnalysis = response.object.degradationsAnalysis;
  }
  if (totalAttempts > 0) {
    result.retriesAnalysis = response.object.retriesAnalysis;
  }
  return result;
};
