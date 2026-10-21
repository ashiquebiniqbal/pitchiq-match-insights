import type { MomentumWindow, MatchStats, TurningPoint } from "@/lib/match/types";
import { MOMENTUM_WEIGHTS } from "@/lib/match/analytics";

export function StatRows({ stats }: { stats: MatchStats }) {
  const rows: [string, number, number, string?][] = [
    ["Possession", stats.home.possession, stats.away.possession, "%"],
    ["Shots", stats.home.shots, stats.away.shots],
    ["On target", stats.home.onTarget, stats.away.onTarget],
    ["xG (synthetic)", stats.home.xg, stats.away.xg],
    ["Passes", stats.home.passes, stats.away.passes],
    ["Pass accuracy", stats.home.accuracy, stats.away.accuracy, "%"],
    ["Turnovers", stats.home.turnovers, stats.away.turnovers],
    ["Recoveries", stats.home.recoveries, stats.away.recoveries],
  ];
  return (
    <div className="space-y-2.5">
      {rows.map(([label, h, a, unit]) => {
        const total = h + a || 1;
        return (
          <div key={label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-mono tabular-nums text-home">{h}{unit}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="font-mono tabular-nums text-away">{a}{unit}</span>
            </div>
            <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
              <div className="bg-home transition-all duration-300" style={{ width: `${(h / total) * 100}%` }} />
              <div className="bg-away transition-all duration-300" style={{ width: `${(a / total) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MomentumChart({ windows, turningPoints, onPick }: { windows: MomentumWindow[]; turningPoints: TurningPoint[]; onPick?: (tp: TurningPoint) => void }) {
  const max = Math.max(6, ...windows.map((w) => Math.abs(w.net)));
  const n = 18;
  const bw = 100 / n;
  return (
    <div>
      <svg viewBox="0 0 100 40" className="h-36 w-full" preserveAspectRatio="none" role="img" aria-label="Momentum by 5-minute window">
        <line x1={0} y1={20} x2={100} y2={20} stroke="var(--border)" strokeWidth={0.3} />
        <line x1={50} y1={0} x2={50} y2={40} stroke="var(--border)" strokeWidth={0.2} strokeDasharray="1 1" />
        {windows.map((w) => {
          const h = (Math.abs(w.net) / max) * 18;
          return (
            <rect key={w.index} x={w.index * bw + 0.4} width={bw - 0.8} y={w.net >= 0 ? 20 - h : 20} height={h} fill={w.net >= 0 ? "var(--home)" : "var(--away)"} opacity={0.85}>
              <title>{`${w.startMin}–${w.endMin}': NBF ${w.home} vs HBC ${w.away} (net ${w.net})`}</title>
            </rect>
          );
        })}
        {turningPoints.map((tp) => (
          <g key={tp.id} onClick={() => onPick?.(tp)} style={{ cursor: "pointer" }}>
            <line x1={(tp.t / 5400) * 100} x2={(tp.t / 5400) * 100} y1={0} y2={40} stroke="var(--warning)" strokeWidth={0.3} />
            <circle cx={(tp.t / 5400) * 100} cy={2} r={1.2} fill="var(--warning)" />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>0'</span><span>45'</span><span>90'</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Window score = {MOMENTUM_WEIGHTS.shot}×shots + {MOMENTUM_WEIGHTS.onTarget}×on target + {MOMENTUM_WEIGHTS.recovery}×recoveries + {MOMENTUM_WEIGHTS.finalThirdPass}×final-third completions. Bar = Northbridge − Harbor. <span className="text-warning">│</span> turning point.
      </p>
    </div>
  );
}
