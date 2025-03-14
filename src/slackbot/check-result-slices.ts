import {
  addMinutes,
  isAfter,
  isBefore,
  isEqual,
  startOfMinute,
} from "date-fns";
import { CheckResult } from "../checkly/models";
import { CheckResultTable } from "../db/check-results";

export interface CheckResultsTimeSlice {
  checkId: string;
  location: string;
  start: Date;
  end: Date;
  data: {
    passingChecks: number;
    degradedChecks: number;
    failingChecks: number;
  };
}

function createTimeSlices(
  checkResultKeys: { checkId: string; location: string }[],
  from: Date,
  to: Date,
  sliceMinutes: number = 30,
): CheckResultsTimeSlice[] {
  const slices: CheckResultsTimeSlice[] = [];
  let sliceStart = startOfMinute(from);

  while (isBefore(sliceStart, to)) {
    const sliceEnd = addMinutes(sliceStart, sliceMinutes);

    for (const { checkId, location } of checkResultKeys) {
      slices.push({
        checkId,
        start: sliceStart,
        end: sliceEnd,
        location,
        data: {
          passingChecks: 0,
          degradedChecks: 0,
          failingChecks: 0,
        },
      });
    }

    sliceStart = sliceEnd;
  }

  return slices;
}

export function aggregateCheckResults(
  results: CheckResultTable[],
  from: Date,
  to: Date,
  sliceMinutes: number = 30,
) {
  const checkResultKeys = results.reduce((acc, result) => {
    const key = `${result.checkId}:${result.runLocation}`;
    if (!acc.has(key)) {
      acc.set(key, { checkId: result.checkId, location: result.runLocation });
    }
    return acc;
  }, new Map<string, { checkId: string; location: string }>());

  console.log("CHECK RESULT KEYS", checkResultKeys.size);

  const slices = createTimeSlices(
    Array.from(checkResultKeys.values()),
    from,
    to,
    sliceMinutes,
  );

  results.forEach((result) => {
    const slice = slices.find(
      (s) =>
        (isBefore(s.start, result.startedAt) ||
          isEqual(s.start, result.startedAt)) &&
        isAfter(s.end, result.startedAt) &&
        s.location === result.runLocation,
    );

    if (slice) {
      if (result.hasFailures || result.hasErrors) {
        slice.data.failingChecks++;
      } else if (result.isDegraded) {
        slice.data.degradedChecks++;
      } else {
        slice.data.passingChecks++;
      }
    } else {
      console.error(
        `Slice not found for result ${result.id} ${result.startedAt}`,
      );
    }
  });

  return slices;
}
