export type TeamId = "NOR" | "HAR";

export type EventType = "pass" | "shot" | "tackle" | "recovery" | "possession_change" | "pressure";

export type EventOutcome =
  | "complete"
  | "incomplete"
  | "goal"
  | "saved"
  | "off_target"
  | "blocked"
  | "won"
  | "lost"
  | "applied";

export type PossessionCause = "intercepted" | "tackled" | "shot_end" | "out_of_play";

export interface MatchEvent {
  id: string;
  /** Match clock in seconds (0–5400). */
  t: number;
  minute: number;
  second: number;
  team: TeamId;
  player: string;
  type: EventType;
  outcome: EventOutcome;
  /** Synthetic pitch coordinates, 0–100. NOR attacks toward x=100, HAR toward x=0. */
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  /** Synthetic expected-goals value for shots. */
  xg?: number;
  cause?: PossessionCause;
}

export interface Team {
  id: TeamId;
  name: string;
  short: string;
}

export interface Match {
  seed: number;
  home: Team;
  away: Team;
  durationSec: number;
  events: MatchEvent[];
}

export interface TeamStats {
  goals: number;
  shots: number;
  onTarget: number;
  xg: number;
  passes: number;
  completed: number;
  accuracy: number;
  turnovers: number;
  recoveries: number;
  possession: number;
}

export interface MatchStats {
  t: number;
  home: TeamStats;
  away: TeamStats;
}

export interface MomentumWindow {
  index: number;
  startMin: number;
  endMin: number;
  home: number;
  away: number;
  /** home − away. Positive = Northbridge pressure. */
  net: number;
  eventIds: string[];
}

export interface TurningPoint {
  id: string;
  t: number;
  minute: number;
  kind: "goal" | "turnover_to_shot" | "momentum_swing";
  team: TeamId;
  title: string;
  what: string;
  why: string;
  score: number;
  eventIds: string[];
  metrics: { key: string; label: string; value: number }[];
}
