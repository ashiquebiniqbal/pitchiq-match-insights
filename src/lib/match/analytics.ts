import type { Match, MatchEvent, MatchStats, MomentumWindow, TeamId, TeamStats, TurningPoint } from "./types";

export const WINDOW_MIN = 5;
/** Transparent momentum weights (shown in the UI). */
export const MOMENTUM_WEIGHTS = { shot: 3, onTarget: 2, recovery: 1, finalThirdPass: 0.25 } as const;

export const eventsUpTo = (events: MatchEvent[], t: number) => events.filter((e) => e.t <= t);

const isOnTarget = (e: MatchEvent) => e.type === "shot" && (e.outcome === "goal" || e.outcome === "saved");
/** Attack-normalised end position: 0 own goal → 100 opponent goal. */
export const progress = (team: TeamId, x: number) => (team === "NOR" ? x : 100 - x);

function teamStats(events: MatchEvent[], team: TeamId): Omit<TeamStats, "possession"> {
  const mine = events.filter((e) => e.team === team);
  const shots = mine.filter((e) => e.type === "shot");
  const passes = mine.filter((e) => e.type === "pass");
  const completed = passes.filter((e) => e.outcome === "complete").length;
  return {
    goals: shots.filter((e) => e.outcome === "goal").length,
    shots: shots.length,
    onTarget: shots.filter(isOnTarget).length,
    xg: Math.round(shots.reduce((s, e) => s + (e.xg ?? 0), 0) * 100) / 100,
    passes: passes.length,
    completed,
    accuracy: passes.length ? Math.round((completed / passes.length) * 100) : 0,
    turnovers: mine.filter((e) => e.type === "possession_change" && e.cause !== "shot_end").length,
    recoveries: mine.filter((e) => e.type === "recovery").length,
  };
}

/** Possession = share of all passes attempted (transparent proxy). */
export function computeStats(match: Match, t: number): MatchStats {
  const ev = eventsUpTo(match.events, t);
  const h = teamStats(ev, "NOR");
  const a = teamStats(ev, "HAR");
  const total = h.passes + a.passes;
  const hp = total ? Math.round((h.passes / total) * 100) : 50;
  return { t, home: { ...h, possession: hp }, away: { ...a, possession: 100 - hp } };
}

function windowScore(events: MatchEvent[], team: TeamId) {
  let s = 0;
  for (const e of events) {
    if (e.team !== team) continue;
    if (e.type === "shot") s += MOMENTUM_WEIGHTS.shot + (isOnTarget(e) ? MOMENTUM_WEIGHTS.onTarget : 0);
    if (e.type === "recovery") s += MOMENTUM_WEIGHTS.recovery;
    if (e.type === "pass" && e.outcome === "complete" && e.endX !== undefined && progress(team, e.endX) > 66)
      s += MOMENTUM_WEIGHTS.finalThirdPass;
  }
  return Math.round(s * 100) / 100;
}

export function computeMomentum(match: Match, t: number): MomentumWindow[] {
  const out: MomentumWindow[] = [];
  const n = Math.ceil(match.durationSec / 60 / WINDOW_MIN);
  for (let i = 0; i < n; i++) {
    const start = i * WINDOW_MIN * 60;
    if (start > t) break;
    const end = Math.min(start + WINDOW_MIN * 60, t + 1);
    const ev = match.events.filter((e) => e.t >= start && e.t < end);
    const home = windowScore(ev, "NOR");
    const away = windowScore(ev, "HAR");
    out.push({
      index: i,
      startMin: i * WINDOW_MIN,
      endMin: (i + 1) * WINDOW_MIN,
      home,
      away,
      net: Math.round((home - away) * 100) / 100,
      eventIds: ev.filter((e) => e.type === "shot" || e.type === "recovery").map((e) => e.id),
    });
  }
  return out;
}

export function scoreAt(match: Match, t: number) {
  const ev = eventsUpTo(match.events, t);
  const g = (tm: TeamId) => ev.filter((e) => e.team === tm && e.type === "shot" && e.outcome === "goal").length;
  return { home: g("NOR"), away: g("HAR") };
}

const teamName = (m: Match, tm: TeamId) => (tm === "NOR" ? m.home.name : m.away.name);

/**
 * Turning point detection — all derived from events:
 *  1. Every goal (score state change), weighted by how it changes the game state.
 *  2. Turnover → shot within 25s (the transition that created a chance).
 *  3. Largest momentum swing between consecutive windows.
 */
export function detectTurningPoints(match: Match): TurningPoint[] {
  const ev = match.events;
  const cands: TurningPoint[] = [];

  ev.forEach((e, idx) => {
    if (e.type !== "shot" || e.outcome !== "goal") return;
    const before = scoreAt(match, e.t - 1);
    const after = scoreAt(match, e.t);
    const diffBefore = before.home - before.away;
    const diffAfter = after.home - after.away;
    const equaliser = diffAfter === 0;
    const lead = Math.sign(diffAfter) !== Math.sign(diffBefore) && diffAfter !== 0;
    const build = ev.slice(Math.max(0, idx - 4), idx).filter((x) => x.team === e.team);
    cands.push({
      id: `TP-${e.id}`,
      t: e.t,
      minute: e.minute,
      kind: "goal",
      team: e.team,
      title: equaliser ? "Equaliser" : lead ? "Go-ahead goal" : "Goal",
      what: `${e.player} scores for ${teamName(match, e.team)} (${after.home}–${after.away}).`,
      why: equaliser
        ? `Restores parity — the scoreline returns to level and the trailing side's deficit is erased.`
        : lead
          ? `Changes who leads the match; the opponent must now chase the game.`
          : `Extends the margin, raising the bar for any comeback.`,
      score: 10 + (equaliser || lead ? 4 : 0) + e.minute / 30,
      eventIds: [...build.map((b) => b.id), e.id],
      metrics: [
        { key: `event.${e.id}.xg`, label: "Shot xG", value: e.xg ?? 0 },
        { key: `event.${e.id}.minute`, label: "Minute", value: e.minute },
      ],
    });
  });

  ev.forEach((e, idx) => {
    if (e.type !== "recovery") return;
    const shot = ev.slice(idx + 1, idx + 15).find((s) => s.type === "shot" && s.team === e.team && s.t - e.t <= 25);
    if (!shot || shot.outcome === "goal") return; // goals already covered
    if ((shot.xg ?? 0) < 0.1) return;
    cands.push({
      id: `TP-${e.id}`,
      t: e.t,
      minute: e.minute,
      kind: "turnover_to_shot",
      team: e.team,
      title: "Transition chance",
      what: `${e.player} wins the ball and ${teamName(match, e.team)} shoot within ${shot.t - e.t}s (${shot.outcome.replace("_", " ")}).`,
      why: `A fast regain-to-shot sequence exposes the opponent before they reorganise; xG ${shot.xg?.toFixed(2)} from a single transition.`,
      score: 5 + (shot.xg ?? 0) * 10,
      eventIds: [e.id, shot.id],
      metrics: [
        { key: `event.${shot.id}.xg`, label: "Shot xG", value: shot.xg ?? 0 },
        { key: `delta.${e.id}.${shot.id}`, label: "Regain → shot (s)", value: shot.t - e.t },
      ],
    });
  });

  const mom = computeMomentum(match, match.durationSec);
  let best: { i: number; swing: number } | null = null;
  for (let i = 1; i < mom.length; i++) {
    const swing = mom[i]!.net - mom[i - 1]!.net;
    if (!best || Math.abs(swing) > Math.abs(best.swing)) best = { i, swing };
  }
  if (best && mom[best.i]!.eventIds.length) {
    const w = mom[best.i]!;
    const tm: TeamId = best.swing > 0 ? "NOR" : "HAR";
    cands.push({
      id: `TP-W${w.index}`,
      t: w.startMin * 60,
      minute: w.startMin,
      kind: "momentum_swing",
      team: tm,
      title: "Momentum swing",
      what: `${teamName(match, tm)} seize control between ${w.startMin}' and ${w.endMin}'.`,
      why: `Largest window-to-window momentum change of the match (${best.swing > 0 ? "+" : ""}${best.swing.toFixed(2)}), driven by shots and ball recoveries.`,
      score: 6 + Math.abs(best.swing) / 2,
      eventIds: w.eventIds,
      metrics: [
        { key: `momentum.${w.index}.net`, label: "Window net momentum", value: w.net },
        { key: `momentum.${w.index - 1}.net`, label: "Previous window", value: mom[best.i - 1]!.net },
      ],
    });
  }

  const top = [...cands].sort((a, b) => b.score - a.score).slice(0, 5);
  return top.sort((a, b) => a.t - b.t);
}

export function formatClock(t: number) {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
