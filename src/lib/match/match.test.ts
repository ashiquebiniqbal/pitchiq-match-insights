import { describe, expect, it } from "vitest";
import { generateMatch, DEFAULT_SEED } from "./generate";
import { computeStats, detectTurningPoints, computeMomentum } from "./analytics";
import { runPipeline, verifyClaims, type DraftClaim } from "../agents/pipeline";

const match = generateMatch(DEFAULT_SEED);
const FT = match.durationSec;

describe("synthetic match", () => {
  it("is deterministic for a seed", () => {
    expect(generateMatch(DEFAULT_SEED).events).toEqual(match.events);
  });
  it("produces the demo scoreline 2–1", () => {
    const s = computeStats(match, FT);
    expect([s.home.goals, s.away.goals]).toEqual([2, 1]);
  });
  it("possession sums to 100 and accuracy matches counts", () => {
    const s = computeStats(match, FT);
    expect(s.home.possession + s.away.possession).toBe(100);
    expect(s.home.accuracy).toBe(Math.round((s.home.completed / s.home.passes) * 100));
  });
  it("stats only count events up to the clock", () => {
    expect(computeStats(match, 0).home.passes).toBeLessThanOrEqual(1);
  });
  it("momentum windows cover 90 minutes in 5-minute blocks", () => {
    expect(computeMomentum(match, FT)).toHaveLength(18);
  });
  it("finds at least three turning points with event evidence", () => {
    const tps = detectTurningPoints(match);
    expect(tps.length).toBeGreaterThanOrEqual(3);
    for (const tp of tps) expect(tp.eventIds.length).toBeGreaterThan(0);
  });
});

describe("verification agent", () => {
  it("passes every claim drafted from computed facts", () => {
    const run = runPipeline(match, FT, detectTurningPoints(match), "analyst");
    expect(run.verifier.output.every((c) => c.status === "pass")).toBe(true);
  });
  it("blocks injected claims with wrong values or missing evidence", () => {
    const run = runPipeline(match, FT, detectTurningPoints(match), "fan", { injectFaulty: true });
    const failed = run.verifier.output.filter((c) => c.status === "fail");
    expect(failed).toHaveLength(2);
    expect(run.adapter.output.blocked).toBe(2);
  });
  it("flags a value that conflicts with computed stats", () => {
    const ctx = { match, t: FT, stats: computeStats(match, FT), events: match.events, turningPoints: [] };
    const claim: DraftClaim = {
      id: "X", factId: "x", kind: "shots", text: "", slots: {},
      citedValues: [{ key: "home.shots", value: ctx.stats.home.shots + 1 }],
      eventIds: [match.events[0]!.id],
    };
    const r = verifyClaims([claim], ctx).output[0]!;
    expect(r.status).toBe("fail");
    expect(r.reasons[0]).toContain("home.shots");
  });
  it("flags events cited from after the current clock", () => {
    const last = match.events[match.events.length - 1]!;
    const ctx = { match, t: 60, stats: computeStats(match, 60), events: [], turningPoints: [] };
    const claim: DraftClaim = { id: "Y", factId: "y", kind: "score", text: "", slots: {}, citedValues: [{ key: "home.goals", value: 0 }], eventIds: [last.id] };
    expect(verifyClaims([claim], ctx).output[0]!.status).toBe("fail");
  });
});
