import { describe, expect, it } from "vitest";
import { isMouthYavgNoop, type MouthYavgResult } from "./computeMouthYavg";

const result = (overrides: Partial<MouthYavgResult>): MouthYavgResult => ({
  yavg: 20,
  yavgNormalized: 20 / (255 * 255),
  controlYavg: 5,
  differentialYavg: 15,
  motionRatio: 4,
  frames: 12,
  sampledSec: [],
  method: "canvas-mouth-control-differential-v341",
  ...overrides,
});

describe("mouth motion differential gate", () => {
  it("accepts localized mouth motion", () => {
    expect(isMouthYavgNoop(result({}))).toBe(false);
  });

  it("rejects global head motion with similar control variance", () => {
    expect(isMouthYavgNoop(result({
      yavg: 900,
      controlYavg: 850,
      differentialYavg: 50,
      motionRatio: 900 / 850,
    }))).toBe(true);
  });

  it("rejects a static mouth", () => {
    expect(isMouthYavgNoop(result({
      yavg: 3,
      controlYavg: 1,
      differentialYavg: 2,
      motionRatio: 3,
    }))).toBe(true);
  });
});