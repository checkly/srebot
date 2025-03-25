import * as dataForge from "data-forge";
import { CheckResultAggregate } from "../db/check-results";
import { log } from "../log";

const hourlyFormatter = new Intl.DateTimeFormat("en-US", {
  hour12: false,
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

export async function summarizeCheckResultsToLabeledCheckStatus(
  aggregatedCheckResults: CheckResultAggregate[],
) {
  let df = new dataForge.DataFrame(aggregatedCheckResults);

  const meanPassRatePerCheckAndLocation = df
    .groupBy((row) => `${row.checkId}|${row.runLocation}`)
    .select((group) => {
      const passing = group.deflate((row) => row.passingCount).sum();
      const degraded = group.deflate((row) => row.degradedCount).sum();
      const failing = group.deflate((row) => row.errorCount).sum();
      const passRateStdDev = group
        .deflate((row) => row.passingCount / row.count)
        .std();
      const meanPassRate = passing / (passing + degraded + failing);

      return {
        checkId: group.first().checkId,
        runLocation: group.first().runLocation,
        meanPassRate,
        passRateStdDev,
      };
    })
    .reduce((acc, row) => {
      acc.set(`${row.checkId}|${row.runLocation}`, {
        meanPassRate: row.meanPassRate,
        passRateStdDev: row.passRateStdDev,
      });
      return acc;
    }, new Map<string, { meanPassRate: number; passRateStdDev: number }>());

  log.debug(
    {
      meanPassRates: Array.from(meanPassRatePerCheckAndLocation.entries()),
    },
    "MEAN PASS RATE",
  );

  interface CheckTimeSlice {
    checkId: string;
    runLocation: string;
    startedAtBin: Date;
    passing: number;
    degraded: number;
    failing: number;
    passRate: number;
    passRateDiff: number;
    passRateStdDev: number;
    degradedRate: number;
    failRate: number;
    cumSumPassRate?: number;
  }

  const checkIdLocationTimeSliceWithPassRateStdDev = df
    .groupBy((row) => `${row.checkId}|${row.runLocation}|${row.startedAtBin}`)
    .select((group): CheckTimeSlice | null => {
      const checkId = group.first().checkId;
      const runLocation = group.first().runLocation;
      const { meanPassRate, passRateStdDev } =
        meanPassRatePerCheckAndLocation.get(`${checkId}|${runLocation}`)!;
      if (meanPassRate == 0 || meanPassRate == 1) {
        return null;
      }

      const count = group.deflate((row) => row.count).sum();
      const passing = group.deflate((row) => row.passingCount).sum();
      const degraded = group.deflate((row) => row.degradedCount).sum();
      const failing = group.deflate((row) => row.errorCount).sum();

      const passRate = passing / count;
      const degradedRate = degraded / count;
      const failRate = failing / count;

      return {
        checkId: group.first().checkId,
        runLocation: group.first().runLocation,
        startedAtBin: group.first().startedAtBin,
        passing,
        degraded,
        failing,
        passRate: passRate,
        passRateDiff: passRate - meanPassRate,
        passRateStdDev,
        degradedRate,
        failRate: failRate,
      };
    })
    .filter((row) => row !== null)
    .inflate()
    .withSeries<CheckTimeSlice & { cumSumPassRate: number }>(
      "cumSumPassRate",
      (s) => s.getSeries("passRateDiff").cumsum(),
    )
    .withSeries<
      CheckTimeSlice & { cumSumPassRate: number; isCheckPoint: boolean }
    >("isCheckPoint", (s) =>
      s.deflate((row) =>
        Math.abs(row.cumSumPassRate) > row.passRateStdDev * 2 ? 1 : 0,
      ),
    )
    .withSeries<
      CheckTimeSlice & {
        cumSumPassRate: number;
        isCheckPoint: boolean;
        checkPointGroup: number;
      }
    >("checkPointGroup", (s) =>
      new dataForge.Series([0]).concat(
        s
          .getSeries("isCheckPoint")
          .rollingWindow(2)
          .select((w) => {
            const firstIsCheckPoint = w.first();
            const lastIsCheckPoint = w.last();
            return firstIsCheckPoint === lastIsCheckPoint ? 0 : 1;
          })
          .cumsum(),
      ),
    );

  log.debug(
    {
      checkIdLocationTimeSliceWithPassRateStdDev:
        checkIdLocationTimeSliceWithPassRateStdDev.toArray(),
    },
    "CHECK ID LOCATION TIME SLICE WITH PASS RATE STD DEV",
  );

  const checksWithChangePoints = checkIdLocationTimeSliceWithPassRateStdDev
    .groupBy((row) => `${row.checkId}|${row.runLocation}`)
    .select((group) => {
      const changePoints = group
        .filter((row) => row.isCheckPoint)
        .groupBy((row) => row.checkPointGroup)
        .select((group) =>
          group.orderBy((row) => Math.abs(row.cumSumPassRate)).last(),
        )
        .toArray();

      return {
        checkId: group.first().checkId,
        runLocation: group.first().runLocation,
        changePoints: changePoints.map((cp) => ({
          timestamp: cp.startedAtBin.getTime(),
          formattedTimestamp: hourlyFormatter.format(cp.startedAtBin),
          severity:
            cp.cumSumPassRate > 0
              ? "FAILING"
              : ("PASSING" as "PASSING" | "FAILING"), // TODO work out how to get degraded
        })),
      };
    })
    .inflate();

  log.debug(
    {
      checksWithChangePoints: checksWithChangePoints.toArray(),
    },
    "CHECKS WITH CHANGE POINTS",
  );

  return checksWithChangePoints;
}
