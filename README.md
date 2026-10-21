# PitchIQ — The Story Behind the Match

Built for Microsoft's *Inside the Game: Developer Hackathon*. PitchIQ turns **fully synthetic** football match events into explainable insights and audience-specific recaps. It shows what happened, why key sequences matter, and lets you trace every number back to the events behind it.

> **Synthetic data statement:** Northbridge FC, Harbor City, all players and all events are fictional. They are generated from a fixed seed. No real league data, official logos or footage are used, and no endorsement by any league, club or Microsoft is implied.

## Features
- Seeded synthetic match (~1,500 events: pass, shot, tackle, recovery, possession change, pressure), each with an ID, clock time, team, player, outcome, pitch coordinates and xG for shots.
- Replay controls: Kick off / Pause / Resume / Replay, Reset, Next key moment, Full time, 1×/2×/4× speed, a timeline scrubber with turning-point markers.
- Analytics computed from the events up to the current clock: score, possession, shots, shots on target, xG, passes, pass accuracy, turnovers, recoveries, and momentum in 5-minute windows (the formula is shown in the UI).
- A pitch event map with filters by event type, plus a click-to-focus evidence table.
- Turning-point detection (goals, regain-to-shot transitions, largest momentum swing). Each one shows the minute, what happened, why it matters, metrics and event IDs.
- A four-stage agent workflow with typed inputs and outputs and a visible status for each stage, a verification ledger, and a Fan/Analyst recap with citations.
- An "Inject unsupported claims" test toggle that shows verification blocking bad claims.
- A Methodology page at `/about`.

## Architecture
```text
src/lib/match/types.ts       typed models (MatchEvent, MatchStats, TurningPoint…)
src/lib/match/generate.ts    Mulberry32 seeded generator
src/lib/match/analytics.ts   pure stats / momentum / turning-point functions
src/lib/agents/pipeline.ts   matchAnalyst → narrativeWriter → verifyClaims → audienceAdapter
src/components/pitchiq/*     Pitch, charts, panels (presentational)
src/routes/index.tsx         interactive workspace
src/routes/about.tsx         methodology
```
Each pipeline stage is a pure function, so you can swap in a model-backed version later without changing the shared types.

## Validation
- `bun run test` runs `src/lib/match/match.test.ts`. It checks that the generator is deterministic, the 2–1 scoreline, that possession and accuracy add up, that stats respect the clock, that there are at least 3 turning points with evidence, and that verification passes good claims and blocks wrong values, missing IDs and future events.
- The Verification Agent recomputes every cited value (`home.shots`, `event.E0123.xg`, `momentum.12.net`, and so on) and checks that every event ID exists and occurs before the current clock.

## Run locally
```bash
bun install
bun run dev      # http://localhost:8080
bun run test
```

## Integrations: honest status
- **Implemented:** local, deterministic TypeScript only. No backend and no secrets.
- **Not implemented:** no LLM calls, no Microsoft Foundry, no Azure services, no external APIs. The recaps come from templates, and the UI says so.

## Next steps for submission
1. Connect GitHub from the Lovable editor (Settings → GitHub) and make the repo public. **No public repo exists yet.**
2. Publish from Lovable, or deploy the build to any edge host. **The app is not publicly hosted yet.**
3. Optional: back the Narrative Writer and Audience Adapter with Azure OpenAI / Foundry through a server function, and keep the Verification Agent as the final check.
4. Record the demo using `DEMO_SCRIPT.md`.
