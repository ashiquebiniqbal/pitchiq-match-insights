import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Info, Pause, Play, RotateCcw, SkipForward, FastForward } from "lucide-react";
import { generateMatch, DEFAULT_SEED } from "@/lib/match/generate";
import { computeMomentum, computeStats, detectTurningPoints, formatClock } from "@/lib/match/analytics";
import { runPipeline, type Audience } from "@/lib/agents/pipeline";
import type { EventType, TurningPoint } from "@/lib/match/types";
import { Pitch, PitchLegend } from "@/components/pitchiq/Pitch";
import { MomentumChart, StatRows } from "@/components/pitchiq/Charts";
import { AgentWorkflow, EvidenceTable, RecapView, TurningPointList } from "@/components/pitchiq/Panels";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { generateFoundryRecap } from "@/lib/foundry.functions";
import { verifyFoundryClaims } from "@/lib/agents/foundry";
import { FoundryPanel, type FoundryState } from "@/components/pitchiq/Panels";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PitchIQ — The Story Behind the Match" },
      { name: "description", content: "Explainable, evidence-backed football match insights and recaps from fully synthetic event data." },
      { property: "og:title", content: "PitchIQ — The Story Behind the Match" },
      { property: "og:description", content: "Turning points, momentum and verified recaps — every claim traceable to synthetic event evidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});

const MATCH = generateMatch(DEFAULT_SEED);
const TPS = detectTurningPoints(MATCH);
const FT = MATCH.durationSec;
const TYPES: EventType[] = ["pass", "shot", "recovery", "tackle", "pressure", "possession_change"];

function Btn({ children, onClick, primary, label, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-all active:scale-95 disabled:opacity-40",
        primary ? "bg-primary text-primary-foreground glow hover:brightness-110" : "border border-border bg-secondary text-secondary-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Workspace() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<TurningPoint | null>(null);
  const [cited, setCited] = useState<string[] | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>("fan");
  const [inject, setInject] = useState(false);
  const [types, setTypes] = useState<Set<EventType>>(new Set(TYPES));
  const [revealed, setRevealed] = useState(4);
  const [foundry, setFoundry] = useState<FoundryState>({ status: "idle" });
  const callFoundry = useServerFn(generateFoundryRecap);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((prev) => {
        const next = Math.min(FT, prev + 30 * speed);
        if (next >= FT) setPlaying(false);
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [playing, speed]);

  const stats = useMemo(() => computeStats(MATCH, t), [t]);
  const momentum = useMemo(() => computeMomentum(MATCH, t), [t]);
  // Recap clock: re-run pipeline at minute granularity while playing to keep it readable.
  const recapT = playing ? Math.floor(t / 300) * 300 : t;
  const run = useMemo(() => runPipeline(MATCH, recapT, TPS, audience, { injectFaulty: inject }), [recapT, audience, inject]);

  // Staged reveal so each agent's status is visible.
  useEffect(() => {
    if (playing) { setRevealed(4); return; }
    setRevealed(0);
    const timers = [1, 2, 3, 4].map((n) => setTimeout(() => setRevealed(n), n * 280));
    return () => timers.forEach(clearTimeout);
  }, [recapT, audience, inject, playing]);

  // Any clock/audience change invalidates a previous Foundry result (no auto re-call).
  useEffect(() => { setFoundry({ status: "idle" }); }, [recapT, audience]);

  async function onFoundry() {
    const at = recapT;
    setFoundry({ status: "loading" });
    try {
      const r = await callFoundry({ data: { t: at, audience } });
      if (!r.ok) return setFoundry({ status: "fallback", message: r.message });
      const ctx = { match: MATCH, t: at, stats: computeStats(MATCH, at), events: MATCH.events.filter((e) => e.t <= at), turningPoints: TPS };
      const claims = verifyFoundryClaims(r.claims, ctx);
      const passed = claims.filter((c) => c.status === "pass");
      if (!passed.length) return setFoundry({ status: "fallback", message: "Foundry responded, but no claim passed verification.", claims });
      setFoundry({ status: "verified", model: r.model, claims });
    } catch {
      setFoundry({ status: "fallback", message: "Foundry request failed." });
    }
  }

  const evidenceIds = cited ?? selected?.eventIds ?? null;
  const highlight = useMemo(() => new Set(evidenceIds ?? []), [evidenceIds]);
  const evidenceEvents = useMemo(() => (evidenceIds ? MATCH.events.filter((e) => highlight.has(e.id)) : []), [evidenceIds, highlight]);

  const mapEvents = useMemo(() => {
    const window = evidenceIds ? MATCH.events.filter((e) => highlight.has(e.id) || (e.t <= t && e.t > t - 120)) : MATCH.events.filter((e) => e.t <= t && e.t > t - 180);
    return window.filter((e) => types.has(e.type) || highlight.has(e.id));
  }, [t, evidenceIds, highlight, types]);

  const selectTP = (tp: TurningPoint) => {
    setPlaying(false);
    setSelected(tp);
    setCited(null);
    setFocusId(tp.eventIds[tp.eventIds.length - 1] ?? null);
    setT(Math.max(t, Math.min(FT, tp.t + 30)));
  };
  const nextMoment = () => {
    const next = TPS.find((tp) => tp.t > (selected?.t ?? t - 1) && tp.id !== selected?.id) ?? TPS.find((tp) => tp.t > t);
    if (next) { selectTP(next); setT(Math.min(FT, next.t + 30)); }
  };
  const reset = () => { setPlaying(false); setT(0); setSelected(null); setCited(null); setFocusId(null); };
  const status = t === 0 ? "Ready" : t >= FT ? "Full time" : playing ? "Live replay" : "Paused";
  const half = t < 2700 ? "1st half" : "2nd half";

  return (
    <div className="mx-auto max-w-[1440px] px-3 pb-12 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-3xl font-bold uppercase tracking-tight">Pitch<span className="text-primary">IQ</span></span>
          <span className="hidden text-sm text-muted-foreground sm:inline">The Story Behind the Match</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-warning/50 bg-warning/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-warning">Synthetic data · fictional teams</span>
          <Link to="/about" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><Info className="h-4 w-4" />Methodology</Link>
        </div>
      </header>

      {/* Scoreboard + controls */}
      <section className="panel p-4 sm:p-5">
        <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-3 lg:justify-end">
            <span className="h-8 w-1.5 rounded bg-home" />
            <div className="lg:text-right"><p className="font-display text-2xl font-semibold uppercase sm:text-3xl">{MATCH.home.name}</p><p className="eyebrow">Home · {MATCH.home.short}</p></div>
          </div>
          <div className="text-center">
            <p className="font-display text-6xl font-bold tabular-nums leading-none"><span className="text-home">{stats.home.goals}</span><span className="mx-3 text-muted-foreground">–</span><span className="text-away">{stats.away.goals}</span></p>
            <p className="mt-1 font-mono text-sm"><span className={cn("mr-2 inline-block h-2 w-2 rounded-full", playing ? "animate-pulse bg-destructive" : "bg-muted-foreground")} />{formatClock(t)} · {half} · {status}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-8 w-1.5 rounded bg-away" />
            <div><p className="font-display text-2xl font-semibold uppercase sm:text-3xl">{MATCH.away.name}</p><p className="eyebrow">Away · {MATCH.away.short}</p></div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Btn primary label={playing ? "Pause" : t >= FT ? "Replay" : "Play"} onClick={() => { if (t >= FT) setT(0); setSelected(null); setCited(null); setPlaying((p) => !p); }}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? "Pause" : t >= FT ? "Replay" : t === 0 ? "Kick off" : "Resume"}
          </Btn>
          <Btn label="Reset" onClick={reset}><RotateCcw className="h-4 w-4" />Reset</Btn>
          <Btn label="Next key moment" onClick={nextMoment} disabled={!TPS.some((tp) => tp.t > (selected?.t ?? t - 1) && tp.id !== selected?.id)}><SkipForward className="h-4 w-4" />Next key moment</Btn>
          <Btn label="Jump to full time" onClick={() => { setPlaying(false); setT(FT); }}><FastForward className="h-4 w-4" />Full time</Btn>
          <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-1" role="group" aria-label="Replay speed">
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={cn("rounded px-2.5 py-1 font-mono text-xs", speed === s ? "bg-muted text-foreground" : "text-muted-foreground")}>{s}×</button>
            ))}
          </div>
        </div>
        <div className="relative mt-4">
          <input type="range" min={0} max={FT} step={10} value={t} aria-label="Match timeline scrubber" onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} className="range-track w-full" />
          <div className="pointer-events-none absolute inset-x-0 -top-1 h-0">
            {TPS.map((tp) => (
              <button key={tp.id} onClick={() => selectTP(tp)} title={`${tp.minute}' ${tp.title}`} aria-label={`${tp.minute}' ${tp.title}`}
                className={cn("pointer-events-auto absolute -translate-x-1/2 -translate-y-full rounded px-1 font-mono text-[10px]", selected?.id === tp.id ? "bg-warning text-primary-foreground" : "text-warning hover:bg-warning/20")}
                style={{ left: `${(tp.t / FT) * 100}%` }}>
                <span className="hidden sm:inline">{tp.minute}'</span><span className="sm:hidden">▾</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        {/* Pitch */}
        <section className="panel p-4 lg:col-span-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><p className="eyebrow">Event map</p><h2 className="font-display text-xl font-semibold uppercase">{evidenceIds ? `Evidence · ${evidenceIds.length} events` : "Last 3 minutes of play"}</h2></div>
            <div className="flex flex-wrap gap-1">
              {TYPES.map((ty) => (
                <button key={ty} onClick={() => setTypes((s) => { const n = new Set(s); n.has(ty) ? n.delete(ty) : n.add(ty); return n; })}
                  className={cn("rounded-full border px-2.5 py-0.5 text-xs capitalize", types.has(ty) ? "border-accent/60 text-foreground" : "border-border text-muted-foreground line-through")}>
                  {ty.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          <Pitch events={mapEvents} highlight={highlight} focusId={focusId} onSelect={setFocusId} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <PitchLegend />
            <p className="font-mono text-[11px] text-muted-foreground">NBF attacks → · HBC attacks ←</p>
          </div>
          {mapEvents.length === 0 && <p className="mt-2 text-center text-sm text-muted-foreground">No events in view yet — press Kick off or pick a turning point.</p>}
        </section>

        {/* Stats */}
        <section className="panel p-4 lg:col-span-4">
          <p className="eyebrow">Computed at {formatClock(t)}</p>
          <h2 className="mb-3 font-display text-xl font-semibold uppercase">Match stats</h2>
          <StatRows stats={stats} />
          <p className="mt-3 text-[11px] text-muted-foreground">Possession = share of passes attempted. All values are recomputed from the event log.</p>
        </section>

        {/* Turning points */}
        <section className="panel p-4 lg:col-span-4">
          <p className="eyebrow">Detected from events</p>
          <h2 className="mb-3 font-display text-xl font-semibold uppercase">Turning points</h2>
          <TurningPointList tps={TPS} selectedId={selected?.id ?? null} onSelect={selectTP} t={t} />
        </section>

        {/* Momentum + evidence */}
        <div className="space-y-4 lg:col-span-8">
          <section className="panel p-4">
            <p className="eyebrow">5-minute windows</p>
            <h2 className="mb-2 font-display text-xl font-semibold uppercase">Momentum trend</h2>
            {momentum.length ? <MomentumChart windows={momentum} turningPoints={TPS.filter((tp) => tp.t <= t)} onPick={selectTP} /> : <p className="py-8 text-center text-sm text-muted-foreground">Momentum appears once play starts.</p>}
          </section>
          <section className="panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <div><p className="eyebrow">Source events</p><h2 className="font-display text-xl font-semibold uppercase">Evidence panel</h2></div>
              {evidenceIds && <button onClick={() => { setCited(null); setSelected(null); }} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>}
            </div>
            <EvidenceTable events={evidenceEvents} focusId={focusId} onFocus={setFocusId} emptyText="Select a turning point or click a citation like [C3] to inspect its source events." />
          </section>
        </div>

        {/* Recap */}
        <section className="panel p-4 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div><p className="eyebrow">Recap at {formatClock(recapT)}</p><h2 className="font-display text-xl font-semibold uppercase">Match recap</h2></div>
            <div className="flex rounded-md border border-border p-1" role="tablist" aria-label="Audience">
              {(["fan", "analyst"] as Audience[]).map((a) => (
                <button key={a} role="tab" aria-selected={audience === a} onClick={() => setAudience(a)} className={cn("rounded px-3 py-1 text-sm capitalize", audience === a ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{a}</button>
              ))}
            </div>
          </div>
          <RecapView run={run} revealed={revealed} audience={audience} onCite={(ids) => { setCited(ids); setSelected(null); setFocusId(ids[ids.length - 1] ?? null); }} />
          <FoundryPanel state={foundry} disabled={playing || run.analyst.status === "empty"} onGenerate={onFoundry} onCite={(ids) => { setCited(ids); setSelected(null); setFocusId(ids[ids.length - 1] ?? null); }} />
        </section>

        {/* Agents */}
        <section className="panel p-4 lg:col-span-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><p className="eyebrow">Deterministic local pipeline · no LLM / cloud calls</p><h2 className="font-display text-xl font-semibold uppercase">Agent workflow</h2></div>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={inject} onChange={(e) => setInject(e.target.checked)} className="accent-[var(--warning)]" />
                Inject unsupported claims (test)
              </label>
              <span className={cn("rounded px-2 py-1 font-mono text-[11px] uppercase", revealed < 3 ? "bg-muted text-muted-foreground" : run.verifier.status === "warn" ? "bg-destructive/20 text-destructive" : "bg-success/15 text-success")}>
                {revealed < 3 ? "verifying…" : run.verifier.status === "warn" ? "Verification: FAIL — claims blocked" : run.verifier.status === "empty" ? "No claims" : "Verification: PASS"}
              </span>
            </div>
          </div>
          <AgentWorkflow run={run} revealed={revealed} onCite={(ids) => { setCited(ids); setSelected(null); }} />
        </section>
      </div>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        All teams, players and events are fictional and generated from seed {MATCH.seed}. Not affiliated with or endorsed by any league, club or Microsoft.
      </footer>
    </div>
  );
}
