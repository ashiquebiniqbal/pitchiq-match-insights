import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { MOMENTUM_WEIGHTS } from "@/lib/match/analytics";
import { DEFAULT_SEED } from "@/lib/match/generate";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "Methodology — PitchIQ" },
      { name: "description", content: "How PitchIQ generates synthetic match data, computes deterministic analytics and verifies every recap claim." },
      { property: "og:title", content: "Methodology — PitchIQ" },
      { property: "og:description", content: "Synthetic data, deterministic analytics and a four-stage verified agent pipeline." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: About,
});

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="font-display text-2xl font-semibold uppercase">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function About() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to workspace</Link>
      <h1 className="font-display text-5xl font-bold uppercase">Pitch<span className="text-primary">IQ</span> methodology</h1>
      <Block title="Synthetic data">
        <p>Northbridge FC, Harbor City and every player are fictional. The match is produced by a seeded pseudo-random generator (Mulberry32, seed {DEFAULT_SEED}), so the same ~1,500 events appear on every load. No real league data, logos or footage are used, and no endorsement is implied.</p>
      </Block>
      <Block title="Deterministic analytics">
        <p>Score, shots, shots on target, synthetic xG, passes, pass accuracy, turnovers and recoveries are counted directly from events up to the current clock. Possession is the share of passes attempted.</p>
        <p>Momentum is summed per 5-minute window: {MOMENTUM_WEIGHTS.shot}×shots + {MOMENTUM_WEIGHTS.onTarget}×on target + {MOMENTUM_WEIGHTS.recovery}×recoveries + {MOMENTUM_WEIGHTS.finalThirdPass}×completed passes into the final third; the chart shows Northbridge minus Harbor.</p>
        <p>Turning points are goals (weighted higher when they change who leads), regain-to-shot transitions within 25 seconds, and the largest window-to-window momentum swing.</p>
      </Block>
      <Block title="Agent pipeline">
        <p><b className="text-foreground">Match Analyst</b> selects candidate facts from computed stats and turning points. <b className="text-foreground">Narrative Writer</b> drafts claims, each carrying cited values and event IDs. <b className="text-foreground">Verification Agent</b> rejects claims whose event IDs are missing, unknown or after the clock, or whose values differ from recomputed stats. <b className="text-foreground">Audience Adapter</b> rephrases only verified claims for Fans or Analysts.</p>
        <p>All four stages are typed TypeScript functions running locally and deterministically. No large language model, Microsoft Foundry or Azure service is called in this MVP.</p>
      </Block>
    </div>
  );
}
