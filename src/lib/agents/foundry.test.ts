import { describe, expect, it } from "vitest";
import { generateMatch, DEFAULT_SEED } from "../match/generate";
import { computeStats, detectTurningPoints } from "../match/analytics";
import { matchAnalyst, type PipelineContext } from "./pipeline";
import { normalizeFoundryEndpoint, parseFoundryContent, verifyFoundryClaims } from "./foundry";

const match = generateMatch(DEFAULT_SEED);
const t = match.durationSec;
const ctx: PipelineContext = { match, t, stats: computeStats(match, t), events: match.events.filter((e) => e.t <= t), turningPoints: detectTurningPoints(match) };
const score = matchAnalyst(ctx).output.find((f) => f.kind === "score")!;

describe("normalizeFoundryEndpoint", () => {
  it("adds the v1 route to a bare resource URL", () => {
    expect(normalizeFoundryEndpoint("https://x.openai.azure.com/")).toBe("https://x.openai.azure.com/openai/v1/chat/completions");
  });
  it("does not duplicate an existing route", () => {
    expect(normalizeFoundryEndpoint("https://x.services.ai.azure.com/openai/v1/chat/completions/")).toBe("https://x.services.ai.azure.com/openai/v1/chat/completions");
    expect(normalizeFoundryEndpoint("https://x.openai.azure.com/openai")).toBe("https://x.openai.azure.com/openai/v1/chat/completions");
  });
  it("rejects non-https or invalid URLs", () => {
    expect(() => normalizeFoundryEndpoint("http://x.com")).toThrow();
    expect(() => normalizeFoundryEndpoint("not a url")).toThrow();
  });
});

describe("parseFoundryContent", () => {
  it("rejects malformed responses", () => {
    expect(() => parseFoundryContent(undefined)).toThrow();
    expect(() => parseFoundryContent("hello")).toThrow();
    expect(() => parseFoundryContent('{"claims":[]}')).toThrow();
    expect(() => parseFoundryContent('{"claims":[{"text":""}]}')).toThrow();
  });
  it("accepts fenced JSON", () => {
    const c = parseFoundryContent('```json\n{"claims":[{"text":"Hi","factId":"F","eventIds":["E1"],"metrics":[]}]}\n```');
    expect(c[0]!.eventIds).toEqual(["E1"]);
  });
});

describe("verifyFoundryClaims", () => {
  const hg = score.metrics[0]!.value;
  const ag = score.metrics[1]!.value;
  it("passes a claim with real evidence and matching numbers", () => {
    const [v] = verifyFoundryClaims([{ text: `Final score ${hg}-${ag}.`, factId: score.id, eventIds: score.eventIds, metrics: score.metrics }], ctx);
    expect(v!.status).toBe("pass");
  });
  it("rejects a mismatched statistic", () => {
    const [v] = verifyFoundryClaims([{ text: `Final score ${hg + 3}-${ag}.`, factId: score.id, eventIds: score.eventIds, metrics: [{ key: "home.goals", value: hg + 3 }] }], ctx);
    expect(v!.status).toBe("fail");
  });
  it("rejects a number in text that isn't cited", () => {
    const [v] = verifyFoundryClaims([{ text: `Score ${hg}-${ag} after 99 shots.`, factId: score.id, eventIds: score.eventIds, metrics: score.metrics }], ctx);
    expect(v!.status).toBe("fail");
  });
  it("rejects missing or invented evidence IDs", () => {
    const [a, b] = verifyFoundryClaims(
      [
        { text: "Great game.", factId: "x", eventIds: [], metrics: score.metrics },
        { text: "Great game.", factId: "x", eventIds: ["E9999"], metrics: score.metrics },
      ],
      ctx,
    );
    expect(a!.status).toBe("fail");
    expect(b!.status).toBe("fail");
  });
});
