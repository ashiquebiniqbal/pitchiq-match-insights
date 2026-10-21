# PitchIQ — The Story Behind the Match

**Turn football events into explainable match stories.**

Built for Microsoft's *Inside the Game: Developer Hackathon*.

- **Public demo:** _coming soon (the app has not been published yet)_
- **Demo video:** _coming soon (no video has been uploaded yet; see `DEMO_SCRIPT.md`)_

> **Synthetic data statement:** Northbridge FC, Harbor City, every player and every event are fictional and generated from a fixed seed. No real league data, official logos or footage are used. No endorsement by any league, club or Microsoft is implied.

## Problem
Match recaps and AI sports summaries often state numbers you can't check. A wrong shot count or an invented "turning point" damages trust, and readers have no way to see where a claim came from.

## Solution
PitchIQ computes every statistic from a visible event log, picks out turning points with the events behind them, and writes recaps only from claims that pass a local verification step. Each number in a recap links back to event IDs or computed metrics you can inspect.

## Features
- **Seeded synthetic match:** about 1,500 events (pass, shot, tackle, recovery, possession change, pressure). Each event has an ID, minute/second, team, player, outcome, pitch coordinates (0–100) and xG for shots.
- **Replay controls:** Kick off / Pause / Resume / Replay, Reset, Next key moment, Full time, 1×/2×/4× speed, and a timeline scrubber with turning-point markers.
- **Deterministic analytics** up to the current clock: score, possession (pass share), shots, shots on target, xG, passes, pass accuracy, turnovers, recoveries, and a 5-minute momentum trend. The momentum formula is shown in the UI.
- **Pitch event map** with event-type filters and a click-to-focus evidence table.
- **Turning points** (goals, regain-to-shot transitions, largest momentum swing). Each shows the minute, what happened, why it matters, and supporting metrics and event IDs.
- **Four-stage agent workflow** with visible status and outputs for each stage:
  1. *Match Analyst* selects candidate moments and facts.
  2. *Narrative Writer* drafts claims from templates.
  3. *Verification Agent* checks event IDs, recomputes cited values and flags unsupported claims.
  4. *Audience Adapter* rephrases verified claims for **Fan** or **Analyst** readers.
- **Verification ledger** with a clear PASS/FAIL and reasons, plus an "Inject unsupported claims" toggle that shows bad claims being blocked.
- **Methodology page** at `/about`.

## Synthetic-data methodology
- A Mulberry32 seeded random generator (`DEFAULT_SEED = 125`) produces the same match every time (a 2–1 result).
- Every analytic is a pure function of the event list and the current clock, so results are reproducible and can be checked in tests.
- Momentum per 5-minute window = 3 × shots + 2 × shots on target + 1 × recoveries + 0.25 × final-third passes (home minus away).

## Responsible AI
- **Default recaps are template-based, not AI-generated,** and the UI labels them that way.
- Recap text is built only from claims that passed verification. Claims with missing or future event IDs, or values that don't match the recomputed numbers, are blocked and shown with the reason.
- No AI model is called on page load, during replay or when the timeline changes.

## Optional Microsoft Foundry integration (honest status)
The code includes an optional **Generate with Microsoft Foundry** button. When clicked, a server function (`src/lib/foundry.functions.ts`) makes one call to the Foundry OpenAI-compatible v1 Chat Completions API. It sends only synthetic facts, event IDs and computed metrics.
- Every model claim goes through the same local Verification Agent, plus a check that every number in the text matches a cited metric. The model's statistics are never trusted.
- **Status:** the Foundry credentials have **not** been configured and the live path has **not** been tested against a real deployment. Without credentials, the app shows "Local template fallback" and keeps the template recap. "Microsoft Foundry — live response verified" appears only after a real successful, verified response.
- Setup: add the backend secrets `AZURE_FOUNDRY_ENDPOINT`, `AZURE_FOUNDRY_API_KEY` and `AZURE_FOUNDRY_MODEL` (the deployment name, e.g. `gpt-4o-mini`). Never put these in frontend code or in the repository.
- Cost controls: click-only, `max_tokens` 450, `temperature` 0.2, JSON response format, at most 8 facts and 6 claims, 20 s timeout. Only HTTP status codes are logged.

## Architecture
```text
src/lib/match/types.ts          typed models (MatchEvent, MatchStats, TurningPoint…)
src/lib/match/generate.ts       seeded synthetic match generator
src/lib/match/analytics.ts      pure stats, momentum and turning-point functions
src/lib/agents/pipeline.ts      matchAnalyst → narrativeWriter → verifyClaims → audienceAdapter
src/lib/agents/foundry.ts       Foundry prompt building, parsing and claim verification (pure)
src/lib/foundry.functions.ts    server-only Foundry call (reads secrets on the server)
src/components/pitchiq/*        presentational UI: pitch map, charts, panels
src/routes/index.tsx            interactive match workspace
src/routes/about.tsx            methodology page
```

### Technologies
TypeScript, React 19, TanStack Start v1 (routing and server functions), Vite 7, Tailwind CSS v4, shadcn/ui components, Vitest, Bun. Built with Lovable.

## Setup and development
Requires [Bun](https://bun.sh).
```bash
bun install
bun run dev        # http://localhost:8080
bun run build      # production build
bun run lint
```

## Testing
```bash
bun run test       # runs vitest once
bun run test:watch
```
Test files:
- `src/lib/match/match.test.ts` — generator determinism, scoreline, possession and accuracy totals, clock-bounded stats, momentum windows, at least 3 turning points with evidence, and verification of good vs. wrong, missing or future claims.
- `src/lib/agents/foundry.test.ts` — endpoint normalisation, malformed model responses, and model-claim verification (mismatched values, unbacked numbers, invented event IDs).
- `src/test/app-routing.test.tsx` — basic app routing.

## Known limitations
- One seeded synthetic match; no real data import.
- Recaps come from templates; the Foundry path is untested live.
- Possession is approximated by pass share, not ball-time.
- Not yet publicly hosted.

## Future plans
- Load multiple matches and custom seeds or event files.
- Test and enable the Foundry path with a real deployment.
- Richer tactical views (heatmaps, pass networks).
- Exportable, citation-linked recaps.
