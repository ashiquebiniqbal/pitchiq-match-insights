/**
 * PitchIQ agent workflow — four deterministic, typed stages executed locally.
 * No LLM or external service is called. Each stage is a pure function so it
 * can be swapped for a model-backed implementation later without changing contracts.
 */
import { computeMomentum, computeStats, formatClock } from "../match/analytics";
import type { Match, MatchEvent, MatchStats, TurningPoint } from "../match/types";

export type Audience = "fan" | "analyst";
export type StageId = "analyst" | "writer" | "verifier" | "adapter";

export interface CitedValue {
  key: string;
  value: number;
}

export interface Fact {
  id: string;
  kind: "score" | "possession" | "shots" | "passing" | "turning_point";
  summary: string;
  metrics: CitedValue[];
  eventIds: string[];
  priority: number;
  slots: Record<string, string | number>;
}

export interface DraftClaim {
  id: string;
  factId: string;
  kind: Fact["kind"] | "injected";
  text: string;
  citedValues: CitedValue[];
  eventIds: string[];
  slots: Record<string, string | number>;
}

export interface VerifiedClaim extends DraftClaim {
  status: "pass" | "fail";
  reasons: string[];
}

export interface RecapLine {
  text: string;
  claimId: string;
  eventIds: string[];
}

export interface Recap {
  audience: Audience;
  headline: string;
  lines: RecapLine[];
  blocked: number;
}

export interface StageResult<T> {
  stage: StageId;
  name: string;
  status: "ok" | "warn" | "empty";
  log: string[];
  output: T;
}

export interface PipelineContext {
  match: Match;
  t: number;
  stats: MatchStats;
  events: MatchEvent[];
  turningPoints: TurningPoint[];
}

const tn = (m: Match, id: string) => (id === "NOR" ? m.home.name : m.away.name);

/* ---------------- Stage 1: Match Analyst ---------------- */
export function matchAnalyst(ctx: PipelineContext): StageResult<Fact[]> {
  const { match, stats, events } = ctx;
  const facts: Fact[] = [];
  const goals = events.filter((e) => e.type === "shot" && e.outcome === "goal");
  if (!events.length) {
    return { stage: "analyst", name: "Match Analyst", status: "empty", log: ["No events before current clock."], output: [] };
  }
  facts.push({
    id: "F-score",
    kind: "score",
    summary: `Score ${stats.home.goals}–${stats.away.goals}`,
    metrics: [
      { key: "home.goals", value: stats.home.goals },
      { key: "away.goals", value: stats.away.goals },
    ],
    eventIds: goals.map((g) => g.id),
    priority: 10,
    slots: { home: match.home.name, away: match.away.name, hg: stats.home.goals, ag: stats.away.goals, clock: formatClock(ctx.t) },
  });
  const shots = events.filter((e) => e.type === "shot");
  if (shots.length) {
    const lead = stats.home.shots >= stats.away.shots ? "home" : "away";
    facts.push({
      id: "F-shots",
      kind: "shots",
      summary: `Shots ${stats.home.shots}–${stats.away.shots}`,
      metrics: [
        { key: "home.shots", value: stats.home.shots },
        { key: "away.shots", value: stats.away.shots },
        { key: "home.onTarget", value: stats.home.onTarget },
        { key: "away.onTarget", value: stats.away.onTarget },
        { key: "home.xg", value: stats.home.xg },
        { key: "away.xg", value: stats.away.xg },
      ],
      eventIds: shots.map((s) => s.id),
      priority: 8,
      slots: { leader: lead === "home" ? match.home.name : match.away.name },
    });
  }
  const passes = events.filter((e) => e.type === "pass");
  if (passes.length) {
    facts.push({
      id: "F-possession",
      kind: "possession",
      summary: `Possession ${stats.home.possession}%–${stats.away.possession}%`,
      metrics: [
        { key: "home.possession", value: stats.home.possession },
        { key: "away.possession", value: stats.away.possession },
        { key: "home.passes", value: stats.home.passes },
        { key: "away.passes", value: stats.away.passes },
      ],
      eventIds: passes.slice(-3).map((p) => p.id),
      priority: 6,
      slots: {},
    });
    facts.push({
      id: "F-passing",
      kind: "passing",
      summary: `Pass accuracy ${stats.home.accuracy}%–${stats.away.accuracy}%`,
      metrics: [
        { key: "home.accuracy", value: stats.home.accuracy },
        { key: "away.accuracy", value: stats.away.accuracy },
        { key: "home.turnovers", value: stats.home.turnovers },
        { key: "away.turnovers", value: stats.away.turnovers },
      ],
      eventIds: events.filter((e) => e.type === "possession_change" && e.cause !== "shot_end").slice(-3).map((e) => e.id),
      priority: 5,
      slots: {},
    });
  }
  ctx.turningPoints
    .filter((tp) => tp.t <= ctx.t)
    .forEach((tp) =>
      facts.push({
        id: `F-${tp.id}`,
        kind: "turning_point",
        summary: `${tp.minute}' ${tp.title}`,
        metrics: tp.metrics.map((m) => ({ key: m.key, value: m.value })),
        eventIds: tp.eventIds,
        priority: 9,
        slots: { minute: tp.minute, title: tp.title, what: tp.what, why: tp.why, team: tn(match, tp.team), kind: tp.kind },
      }),
    );
  const sorted = facts.sort((a, b) => b.priority - a.priority);
  return {
    stage: "analyst",
    name: "Match Analyst",
    status: "ok",
    log: [`Scanned ${events.length} events up to ${formatClock(ctx.t)}.`, `Selected ${sorted.length} candidate facts (${sorted.filter((f) => f.kind === "turning_point").length} turning points).`],
    output: sorted,
  };
}

/* ---------------- Stage 2: Narrative Writer ---------------- */
export function narrativeWriter(facts: Fact[], opts: { injectFaulty?: boolean } = {}): StageResult<DraftClaim[]> {
  const claims: DraftClaim[] = facts.map((f, i) => {
    const v = (k: string) => f.metrics.find((m) => m.key === k)?.value ?? 0;
    let text = f.summary;
    if (f.kind === "score") text = `${f.slots.home} ${v("home.goals")}–${v("away.goals")} ${f.slots.away} at ${f.slots.clock}.`;
    if (f.kind === "shots") text = `Shots ${v("home.shots")}–${v("away.shots")} (on target ${v("home.onTarget")}–${v("away.onTarget")}), xG ${v("home.xg")}–${v("away.xg")}.`;
    if (f.kind === "possession") text = `Possession ${v("home.possession")}%–${v("away.possession")}% from ${v("home.passes")}–${v("away.passes")} passes.`;
    if (f.kind === "passing") text = `Pass accuracy ${v("home.accuracy")}%–${v("away.accuracy")}%; turnovers ${v("home.turnovers")}–${v("away.turnovers")}.`;
    if (f.kind === "turning_point") text = `${f.slots.minute}' — ${f.slots.what} ${f.slots.why}`;
    return { id: `C${i + 1}`, factId: f.id, kind: f.kind, text, citedValues: f.metrics, eventIds: f.eventIds, slots: f.slots };
  });
  const log = [`Drafted ${claims.length} claims, each bound to its source fact.`];
  if (opts.injectFaulty && facts.length) {
    const shots = facts.find((f) => f.kind === "shots");
    const realShots = shots?.metrics.find((m) => m.key === "home.shots")?.value ?? 0;
    claims.push({
      id: `C${claims.length + 1}`,
      factId: "none",
      kind: "injected",
      text: `Northbridge FC fired ${realShots + 6} shots and dominated every phase.`,
      citedValues: [{ key: "home.shots", value: realShots + 6 }],
      eventIds: ["E9999"],
      slots: {},
    });
    claims.push({
      id: `C${claims.length + 1}`,
      factId: "none",
      kind: "injected",
      text: `Harbor City's keeper was the man of the match.`,
      citedValues: [],
      eventIds: [],
      slots: {},
    });
    log.push("Test mode: injected 2 unsupported claims to exercise verification.");
  }
  return { stage: "writer", name: "Narrative Writer", status: "ok", log, output: claims };
}

/* ---------------- Stage 3: Verification Agent ---------------- */
export function resolveMetric(key: string, ctx: PipelineContext): number | undefined {
  const parts = key.split(".");
  if (parts[0] === "home" || parts[0] === "away") {
    const v = (ctx.stats[parts[0]] as unknown as Record<string, number>)[parts[1]];
    return typeof v === "number" ? v : undefined;
  }
  if (parts[0] === "event") {
    const e = ctx.match.events.find((x) => x.id === parts[1]);
    if (!e || e.t > ctx.t) return undefined;
    const v = (e as unknown as Record<string, unknown>)[parts[2]];
    return typeof v === "number" ? v : undefined;
  }
  if (parts[0] === "delta") {
    const a = ctx.match.events.find((x) => x.id === parts[1]);
    const b = ctx.match.events.find((x) => x.id === parts[2]);
    return a && b ? b.t - a.t : undefined;
  }
  if (parts[0] === "momentum") {
    const w = computeMomentum(ctx.match, ctx.match.durationSec)[Number(parts[1])];
    return w?.[parts[2] as "net"];
  }
  return undefined;
}

export function verifyClaims(claims: DraftClaim[], ctx: PipelineContext): StageResult<VerifiedClaim[]> {
  const known = new Map(ctx.match.events.map((e) => [e.id, e]));
  const out = claims.map<VerifiedClaim>((c) => {
    const reasons: string[] = [];
    if (!c.eventIds.length) reasons.push("No supporting event IDs cited.");
    for (const id of c.eventIds) {
      const e = known.get(id);
      if (!e) reasons.push(`Event ${id} does not exist in the match log.`);
      else if (e.t > ctx.t) reasons.push(`Event ${id} occurs after the current clock.`);
    }
    if (!c.citedValues.length) reasons.push("No numeric evidence cited.");
    for (const cv of c.citedValues) {
      const actual = resolveMetric(cv.key, ctx);
      if (actual === undefined) reasons.push(`Metric ${cv.key} cannot be resolved.`);
      else if (Math.abs(actual - cv.value) > 1e-6) reasons.push(`${cv.key} cited as ${cv.value}, computed ${actual}.`);
    }
    return { ...c, status: reasons.length ? "fail" : "pass", reasons };
  });
  const failed = out.filter((c) => c.status === "fail").length;
  return {
    stage: "verifier",
    name: "Verification Agent",
    status: failed ? "warn" : out.length ? "ok" : "empty",
    log: [`Checked ${out.length} claims against ${ctx.events.length} events and computed stats.`, failed ? `${failed} claim(s) blocked.` : "All claims verified."],
    output: out,
  };
}

/* ---------------- Stage 4: Audience Adapter ---------------- */
export function audienceAdapter(claims: VerifiedClaim[], audience: Audience, match: Match): StageResult<Recap> {
  const ok = claims.filter((c) => c.status === "pass");
  const blocked = claims.length - ok.length;
  const val = (c: VerifiedClaim, k: string) => c.citedValues.find((m) => m.key === k)?.value ?? 0;
  const score = ok.find((c) => c.kind === "score");
  let headline = "Waiting for kick-off";
  if (score) {
    const hg = val(score, "home.goals");
    const ag = val(score, "away.goals");
    headline =
      audience === "fan"
        ? hg === ag
          ? `All square: ${match.home.name} ${hg}–${ag} ${match.away.name}`
          : `${hg > ag ? match.home.name : match.away.name} ${hg > ag ? "edge" : "lead"} it ${Math.max(hg, ag)}–${Math.min(hg, ag)}`
        : `${match.home.short} ${hg}–${ag} ${match.away.short} · ${score.slots.clock}`;
  }
  const lines: RecapLine[] = ok
    .filter((c) => c.kind !== "score")
    .map((c) => {
      let text = c.text;
      if (audience === "fan") {
        if (c.kind === "turning_point") text = `${c.slots.minute}' ${c.slots.title}! ${c.slots.what}`;
        if (c.kind === "shots") text = `${c.slots.leader} carried more of the threat in front of goal.`;
        if (c.kind === "possession") text = `${val(c, "home.possession") >= 50 ? match.home.name : match.away.name} saw more of the ball (${Math.max(val(c, "home.possession"), val(c, "away.possession"))}%).`;
        if (c.kind === "passing") text = `Passing was ${val(c, "home.accuracy") >= val(c, "away.accuracy") ? "sharper from Northbridge" : "sharper from Harbor City"}.`;
      } else if (c.kind === "turning_point") {
        text = `${c.slots.minute}' [${c.slots.kind}] ${c.slots.what} ${c.slots.why}`;
      }
      return { text, claimId: c.id, eventIds: c.eventIds };
    });
  return {
    stage: "adapter",
    name: "Audience Adapter",
    status: ok.length ? "ok" : "empty",
    log: [`Rendered ${lines.length} verified lines for ${audience === "fan" ? "Fan" : "Analyst"} audience.`, blocked ? `Excluded ${blocked} blocked claim(s).` : "No claims excluded."],
    output: { audience, headline, lines: audience === "fan" ? lines.slice(0, 5) : lines, blocked },
  };
}

export interface PipelineRun {
  analyst: StageResult<Fact[]>;
  writer: StageResult<DraftClaim[]>;
  verifier: StageResult<VerifiedClaim[]>;
  adapter: StageResult<Recap>;
}

export function runPipeline(
  match: Match,
  t: number,
  turningPoints: TurningPoint[],
  audience: Audience,
  opts: { injectFaulty?: boolean } = {},
): PipelineRun {
  const ctx: PipelineContext = { match, t, stats: computeStats(match, t), events: match.events.filter((e) => e.t <= t), turningPoints };
  const analyst = matchAnalyst(ctx);
  const writer = narrativeWriter(analyst.output, opts);
  const verifier = verifyClaims(writer.output, ctx);
  const adapter = audienceAdapter(verifier.output, audience, match);
  return { analyst, writer, verifier, adapter };
}
