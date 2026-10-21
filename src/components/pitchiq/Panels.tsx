import { CheckCircle2, CircleDashed, Loader2, ShieldAlert, XCircle } from "lucide-react";
import type { MatchEvent, TurningPoint } from "@/lib/match/types";
import type { Audience, PipelineRun, StageId } from "@/lib/agents/pipeline";
import { cn } from "@/lib/utils";

export function TeamDot({ team }: { team: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", team === "NOR" ? "bg-home" : "bg-away")} />;
}

export function TurningPointList({ tps, selectedId, onSelect, t }: { tps: TurningPoint[]; selectedId: string | null; onSelect: (tp: TurningPoint) => void; t: number }) {
  if (!tps.length) return <p className="text-sm text-muted-foreground">No turning points detected.</p>;
  return (
    <ol className="space-y-2">
      {tps.map((tp) => {
        const future = tp.t > t;
        const sel = tp.id === selectedId;
        return (
          <li key={tp.id}>
            <button
              onClick={() => onSelect(tp)}
              className={cn(
                "w-full rounded-md border p-3 text-left transition-colors",
                sel ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
                future && !sel && "opacity-55",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-display text-2xl font-semibold leading-none text-warning">{tp.minute}'</span>
                <TeamDot team={tp.team} />
                <span className="font-display text-lg font-semibold uppercase tracking-wide">{tp.title}</span>
                {future && <span className="ml-auto eyebrow">upcoming</span>}
              </div>
              <p className="mt-1.5 text-sm">{tp.what}</p>
              {sel && (
                <div className="mt-2 space-y-2">
                  <p className="text-sm text-muted-foreground"><span className="text-foreground">Why it matters: </span>{tp.why}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tp.metrics.map((m) => (
                      <span key={m.key} className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{m.label}: <span className="text-primary">{m.value}</span></span>
                    ))}
                  </div>
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function EvidenceTable({ events, focusId, onFocus, emptyText }: { events: MatchEvent[]; focusId: string | null; onFocus: (id: string) => void; emptyText: string }) {
  if (!events.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-left font-mono text-xs">
        <thead className="sticky top-0 bg-panel text-muted-foreground">
          <tr><th className="py-1.5 pr-2">ID</th><th className="pr-2">Clock</th><th className="pr-2">Team</th><th className="pr-2">Type</th><th className="pr-2">Outcome</th><th className="pr-2">x,y</th><th>xG</th></tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} onClick={() => onFocus(e.id)} className={cn("cursor-pointer border-t border-border/60", focusId === e.id ? "bg-primary/15" : "hover:bg-muted/40")}>
              <td className="py-1.5 pr-2 text-primary">{e.id}</td>
              <td className="pr-2">{e.minute}:{String(e.second).padStart(2, "0")}</td>
              <td className="pr-2"><span className="inline-flex items-center gap-1"><TeamDot team={e.team} />{e.team}</span></td>
              <td className="pr-2">{e.type.replace("_", " ")}</td>
              <td className="pr-2">{e.outcome.replace("_", " ")}</td>
              <td className="pr-2">{e.x.toFixed(0)},{e.y.toFixed(0)}</td>
              <td>{e.xg ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STAGES: { id: StageId; name: string; role: string }[] = [
  { id: "analyst", name: "Match Analyst", role: "Selects candidate facts from computed stats & turning points" },
  { id: "writer", name: "Narrative Writer", role: "Drafts claims bound to fact metrics and event IDs" },
  { id: "verifier", name: "Verification Agent", role: "Checks event IDs exist, precede the clock, and values match stats" },
  { id: "adapter", name: "Audience Adapter", role: "Rephrases verified claims only, for Fan or Analyst" },
];

export function AgentWorkflow({ run, revealed, onCite }: { run: PipelineRun; revealed: number; onCite: (ids: string[]) => void }) {
  return (
    <div className="space-y-3">
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((s, i) => {
          const res = run[s.id];
          const state = i < revealed ? res.status : i === revealed ? "running" : "pending";
          return (
            <li key={s.id} className={cn("rounded-md border p-3 transition-colors", state === "running" ? "border-accent" : state === "warn" ? "border-warning/70" : "border-border")}>
              <div className="flex items-center gap-2">
                {state === "pending" && <CircleDashed className="h-4 w-4 text-muted-foreground" />}
                {state === "running" && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
                {state === "ok" && <CheckCircle2 className="h-4 w-4 text-success" />}
                {state === "warn" && <ShieldAlert className="h-4 w-4 text-warning" />}
                {state === "empty" && <CircleDashed className="h-4 w-4 text-muted-foreground" />}
                <span className="eyebrow">Stage {i + 1}</span>
              </div>
              <p className="mt-1 font-display text-lg font-semibold uppercase">{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.role}</p>
              {i < revealed && (
                <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-foreground/80">
                  {res.log.map((l) => <li key={l}>› {l}</li>)}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {revealed >= 3 && (
        <div>
          <p className="eyebrow mb-2">Verification ledger</p>
          <ul className="max-h-64 space-y-1.5 overflow-auto">
            {run.verifier.output.map((c) => (
              <li key={c.id} className={cn("rounded border px-3 py-2 text-sm", c.status === "pass" ? "border-border" : "border-destructive/60 bg-destructive/10")}>
                <div className="flex items-start gap-2">
                  {c.status === "pass" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                  <div className="min-w-0 flex-1">
                    <p><span className="font-mono text-xs text-muted-foreground">{c.id} · </span>{c.text}</p>
                    {c.reasons.length > 0 && <ul className="mt-1 text-xs text-destructive">{c.reasons.map((r) => <li key={r}>✕ {r}</li>)}</ul>}
                    {c.eventIds.length > 0 && (
                      <button onClick={() => onCite(c.eventIds)} className="mt-1 font-mono text-[11px] text-accent hover:underline">
                        evidence: {c.eventIds.slice(0, 6).join(", ")}{c.eventIds.length > 6 ? ` +${c.eventIds.length - 6}` : ""}
                      </button>
                    )}
                  </div>
                  <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] uppercase", c.status === "pass" ? "bg-success/15 text-success" : "bg-destructive/20 text-destructive")}>{c.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RecapView({ run, revealed, audience, onCite }: { run: PipelineRun; revealed: number; audience: Audience; onCite: (ids: string[]) => void }) {
  const recap = run.adapter.output;
  if (revealed < 4) return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Running pipeline…</div>;
  if (!recap.lines.length && run.analyst.status === "empty")
    return <p className="py-8 text-center text-sm text-muted-foreground">Kick-off hasn't happened yet. Press Play or jump to a key moment to generate a recap.</p>;
  return (
    <div>
      <h3 className="font-display text-2xl font-semibold uppercase leading-tight">{recap.headline}</h3>
      <ul className={cn("mt-3 space-y-2", audience === "analyst" && "text-sm")}>
        {recap.lines.map((l) => (
          <li key={l.claimId} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              {l.text}{" "}
              <button onClick={() => onCite(l.eventIds)} className="font-mono text-[11px] text-accent hover:underline" aria-label={`Show evidence for ${l.claimId}`}>[{l.claimId}]</button>
            </span>
          </li>
        ))}
      </ul>
      {recap.blocked > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-warning"><ShieldAlert className="h-3.5 w-3.5" />{recap.blocked} unsupported claim(s) were blocked by verification and excluded.</p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">Generated by deterministic templates from verified facts — no AI model was called.</p>
    </div>
  );
}

export type FoundryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "fallback"; message: string; claims?: import("@/lib/agents/pipeline").VerifiedClaim[] }
  | { status: "verified"; model: string; claims: import("@/lib/agents/pipeline").VerifiedClaim[] };

export function FoundryPanel({ state, disabled, onGenerate, onCite }: { state: FoundryState; disabled: boolean; onGenerate: () => void; onCite: (ids: string[]) => void }) {
  const claims = state.status === "verified" || state.status === "fallback" ? state.claims ?? [] : [];
  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Optional: reword verified facts with Microsoft Foundry (one call per click).</p>
        <button onClick={onGenerate} disabled={disabled || state.status === "loading"} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-muted disabled:opacity-40">
          {state.status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}Generate with Microsoft Foundry
        </button>
      </div>
      {state.status === "verified" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" />Microsoft Foundry — live response verified ({state.model})</p>
      )}
      {state.status === "fallback" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-warning"><ShieldAlert className="h-3.5 w-3.5" />Local template fallback — {state.message} The recap above is unchanged.</p>
      )}
      {claims.length > 0 && (
        <ul className="mt-2 space-y-2 text-sm">
          {claims.map((c) => (
            <li key={c.id} className={cn("flex gap-2", c.status === "fail" && "opacity-60")}>
              {c.status === "pass" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
              <span>
                <span className={cn(c.status === "fail" && "line-through")}>{c.text}</span>{" "}
                {c.status === "pass" ? (
                  <button onClick={() => onCite(c.eventIds)} className="font-mono text-[11px] text-accent hover:underline" aria-label={`Show evidence for ${c.id}`}>[{c.id}]</button>
                ) : (
                  <span className="block text-[11px] text-destructive">Blocked: {c.reasons.join(" ")}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
