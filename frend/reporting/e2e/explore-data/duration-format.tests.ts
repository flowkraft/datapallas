// Durations — a number column whose name says it is a time span is written in the unit its name
// gives. Before, every duration was taken for milliseconds below 1000 read as seconds, so 5 in a
// `days` column read "5s", 90 minutes "1m 30s" and 999 ms "16m 39s".

import { durationUnitFromName, formatCellText, pickColumnFormat } from "@/lib/explore-data/type-formatters";
import type { ColumnSchema } from "@/lib/explore-data/types";

const col = (columnName: string): ColumnSchema => ({ columnName, typeName: "DOUBLE", isNullable: true });
const shown = (columnName: string, value: number) => formatCellText(value, col(columnName));

describe("Durations are written in the unit their column names", () => {
  it("reads the unit off the name", () => {
    expect(durationUnitFromName("days")).toBe("d");
    expect(durationUnitFromName("Delivery days")).toBe("d");
    expect(durationUnitFromName("hours")).toBe("h");
    expect(durationUnitFromName("minutes")).toBe("min");
    expect(durationUnitFromName("seconds")).toBe("s");
    expect(durationUnitFromName("ms")).toBe("ms");
    expect(durationUnitFromName("millis")).toBe("ms");
    expect(durationUnitFromName("duration")).toBeUndefined();
  });

  it("writes each unit as its two largest parts", () => {
    expect(shown("days", 5)).toBe("5d");
    expect(shown("Delivery days", 2.5)).toBe("2d 12h");
    expect(shown("hours", 3)).toBe("3h");
    expect(shown("minutes", 90)).toBe("1h 30m");
    expect(shown("seconds", 45)).toBe("45s");
    expect(shown("ms", 999)).toBe("999 ms");
    expect(shown("ms", 1500)).toBe("1.5s");
  });

  it("carries a rounding into the larger part, and keeps the sign", () => {
    expect(shown("minutes", 59.996)).toBe("1h");
    expect(shown("hours", 23.9999)).toBe("1d");
    expect(shown("seconds", 59.97)).toBe("1m");
    expect(shown("ms", 999.6)).toBe("1s");
    expect(shown("days", -3)).toBe("-3d");
  });

  it("writes nothing at all in the column's own unit", () => {
    expect(shown("days", 0)).toBe("0d");
    expect(shown("ms", 0)).toBe("0 ms");
  });

  it("does not guess the unit of a duration whose name gives none", () => {
    expect(pickColumnFormat(col("duration")).kind).toBe("number");
    expect(pickColumnFormat(col("elapsed")).kind).toBe("number");
    expect(shown("elapsed", 12.5)).toBe((12.5).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  });
});
