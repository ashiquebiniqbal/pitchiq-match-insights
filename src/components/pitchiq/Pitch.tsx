import type { MatchEvent } from "@/lib/match/types";
import { cn } from "@/lib/utils";

const W = 105;
const H = 68;
const sx = (x: number) => (x / 100) * W;
const sy = (y: number) => (y / 100) * H;

interface Props {
  events: MatchEvent[];
  highlight: Set<string>;
  focusId?: string | null;
  onSelect?: (id: string) => void;
}

export function Pitch({ events, highlight, focusId, onSelect }: Props) {
  return (
    <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="w-full rounded-md bg-pitch" role="img" aria-label="Synthetic event map">
      <g fill="none" stroke="var(--pitch-line)" strokeWidth={0.35}>
        <rect x={0} y={0} width={W} height={H} />
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
        <circle cx={W / 2} cy={H / 2} r={9.15} />
        <rect x={0} y={H / 2 - 20.16} width={16.5} height={40.32} />
        <rect x={W - 16.5} y={H / 2 - 20.16} width={16.5} height={40.32} />
        <rect x={0} y={H / 2 - 9.16} width={5.5} height={18.32} />
        <rect x={W - 5.5} y={H / 2 - 9.16} width={5.5} height={18.32} />
        <rect x={-1.5} y={H / 2 - 3.66} width={1.5} height={7.32} />
        <rect x={W} y={H / 2 - 3.66} width={1.5} height={7.32} />
      </g>
      {events.map((e) => {
        const hl = highlight.has(e.id);
        const focus = e.id === focusId;
        const color = e.team === "NOR" ? "var(--home)" : "var(--away)";
        const op = highlight.size ? (hl ? 1 : 0.18) : 0.75;
        const common = {
          onClick: () => onSelect?.(e.id),
          style: { cursor: onSelect ? "pointer" : undefined },
          opacity: op,
        };
        if (e.type === "pass" && e.endX !== undefined && e.endY !== undefined) {
          return (
            <g key={e.id} {...common}>
              <line x1={sx(e.x)} y1={sy(e.y)} x2={sx(e.endX)} y2={sy(e.endY)} stroke={color} strokeWidth={focus ? 0.8 : 0.35} strokeDasharray={e.outcome === "complete" ? undefined : "1 1"} />
              <circle cx={sx(e.endX)} cy={sy(e.endY)} r={0.5} fill={color} />
              <title>{`${e.id} ${e.minute}' pass ${e.outcome} — ${e.player}`}</title>
            </g>
          );
        }
        if (e.type === "shot") {
          const r = 1 + (e.xg ?? 0.05) * 5;
          return (
            <g key={e.id} {...common}>
              <circle cx={sx(e.x)} cy={sy(e.y)} r={r} fill={e.outcome === "goal" ? color : "transparent"} stroke={color} strokeWidth={0.5} />
              {focus && <circle cx={sx(e.x)} cy={sy(e.y)} r={r + 1.5} fill="none" stroke="var(--foreground)" strokeWidth={0.3} />}
              <title>{`${e.id} ${e.minute}' shot ${e.outcome} xG ${e.xg} — ${e.player}`}</title>
            </g>
          );
        }
        const shape = e.type === "tackle" ? "M -0.9 -0.9 L 0.9 0.9 M 0.9 -0.9 L -0.9 0.9" : e.type === "recovery" ? "M 0 -1.1 L 1.1 0 L 0 1.1 L -1.1 0 Z" : e.type === "pressure" ? "M -1 0.8 L 0 -1 L 1 0.8 Z" : "M -0.6 -0.6 h 1.2 v 1.2 h -1.2 Z";
        return (
          <g key={e.id} transform={`translate(${sx(e.x)} ${sy(e.y)}) scale(${focus ? 1.8 : 1})`} {...common}>
            <path d={shape} fill={e.type === "tackle" ? "none" : color} stroke={color} strokeWidth={0.35} />
            <title>{`${e.id} ${e.minute}' ${e.type.replace("_", " ")} ${e.outcome} — ${e.player}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

export function PitchLegend({ className }: { className?: string }) {
  const items = [
    ["—", "Pass (dashed = failed)"],
    ["○", "Shot (size = xG, filled = goal)"],
    ["◆", "Recovery"],
    ["✕", "Tackle"],
    ["▲", "Pressure"],
    ["■", "Possession change"],
  ];
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {items.map(([s, l]) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className="font-mono text-foreground">{s}</span>
          {l}
        </li>
      ))}
    </ul>
  );
}
