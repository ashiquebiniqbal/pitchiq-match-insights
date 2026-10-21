import type { Match, MatchEvent, TeamId } from "./types";

/** Mulberry32 — tiny deterministic PRNG. Same seed ⇒ same sequence. */
export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_SEED = 125;
export const DURATION = 5400;

const PLAYERS: Record<TeamId, string[]> = {
  NOR: ["A. Kestrel", "M. Oduya", "J. Lindqvist", "R. Calder", "T. Mwangi", "S. Ferreira", "D. Haldane", "L. Okafor", "P. Strand", "E. Vance"],
  HAR: ["K. Marlow", "B. Achebe", "N. Tidewell", "C. Rourke", "I. Salgado", "F. Brennan", "O. Pike", "Y. Daoud", "G. Whitlock", "H. Quay"],
};

const other = (t: TeamId): TeamId => (t === "NOR" ? "HAR" : "NOR");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
/** Convert attack-normalised progress (0 own goal → 100 opp goal) into absolute x. */
const absX = (team: TeamId, p: number) => round1(team === "NOR" ? p : 100 - p);

export function generateMatch(seed: number = DEFAULT_SEED): Match {
  const r = mulberry32(seed);
  const events: MatchEvent[] = [];
  let t = 0;
  let team: TeamId = "NOR";
  let n = 0;
  const pick = (tm: TeamId) => PLAYERS[tm][Math.floor(r() * PLAYERS[tm].length)]!;
  const push = (e: Omit<MatchEvent, "id" | "t" | "minute" | "second">) => {
    n++;
    const tt = Math.min(t, DURATION - 1);
    events.push({ ...e, id: `E${String(n).padStart(4, "0")}`, t: tt, minute: Math.floor(tt / 60), second: tt % 60 });
  };

  while (t < DURATION - 10) {
    // Northbridge get a slight structural edge in build-up quality.
    const quality = team === "NOR" ? 0.87 : 0.83;
    let p = 18 + r() * 27;
    let y = round1(10 + r() * 80);
    const seqLen = 2 + Math.floor(r() * 8);
    let ended = false;

    for (let i = 0; i < seqLen && t < DURATION - 10; i++) {
      t += 3 + Math.floor(r() * 6);
      const opp = other(team);
      if (r() < 0.16) {
        push({ team: opp, player: pick(opp), type: "pressure", outcome: "applied", x: absX(team, p), y });
        t += 1;
      }
      if (r() < 0.085) {
        const won = r() < 0.6;
        push({ team: opp, player: pick(opp), type: "tackle", outcome: won ? "won" : "lost", x: absX(team, p), y });
        if (won) {
          t += 1;
          push({ team: opp, player: pick(opp), type: "recovery", outcome: "won", x: absX(team, p), y });
          push({ team, player: pick(team), type: "possession_change", outcome: "lost", x: absX(team, p), y, cause: "tackled" });
          team = opp;
          ended = true;
          break;
        }
      }
      const np = round1(clamp(p + (r() * 24 - 6), 5, 97));
      const ny = round1(clamp(y + (r() * 40 - 20), 3, 97));
      const ok = r() < quality - (np > 75 ? 0.14 : 0);
      push({ team, player: pick(team), type: "pass", outcome: ok ? "complete" : "incomplete", x: absX(team, p), y, endX: absX(team, np), endY: ny });
      if (!ok) {
        t += 1;
        push({ team, player: pick(team), type: "possession_change", outcome: "lost", x: absX(team, np), y: ny, cause: "intercepted" });
        push({ team: opp, player: pick(opp), type: "recovery", outcome: "won", x: absX(team, np), y: ny });
        team = opp;
        ended = true;
        break;
      }
      p = np;
      y = ny;
      if (p > 68 && r() < 0.45) {
        t += 2;
        const xg = Math.round(clamp(0.03 + ((p - 70) / 30) * 0.38 - (Math.abs(y - 50) / 50) * 0.12, 0.02, 0.62) * 100) / 100;
        const roll = r();
        const outcome = roll < xg ? "goal" : roll < xg + 0.26 ? "saved" : roll < xg + 0.45 ? "blocked" : "off_target";
        push({ team, player: pick(team), type: "shot", outcome, x: absX(team, p), y, xg });
        t += outcome === "goal" ? 60 : 8;
        push({ team, player: pick(team), type: "possession_change", outcome: "lost", x: absX(team, p), y, cause: "shot_end" });
        team = opp;
        ended = true;
        break;
      }
    }
    if (!ended && t < DURATION - 10) {
      t += 2;
      push({ team, player: pick(team), type: "possession_change", outcome: "lost", x: absX(team, p), y, cause: "out_of_play" });
      team = other(team);
    }
  }

  return {
    seed,
    durationSec: DURATION,
    home: { id: "NOR", name: "Northbridge FC", short: "NBF" },
    away: { id: "HAR", name: "Harbor City", short: "HBC" },
    events,
  };
}
