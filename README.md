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
- **Default:** deterministic local templates. No AI model is called on load, during replay, or on timeline changes.
- **Optional Microsoft Foundry:** the "Generate with Microsoft Foundry" button under the recap makes **one** server-side call to the Foundry OpenAI-compatible v1 Chat Completions API. Facts are recomputed on the server from the seeded synthetic match; only fact summaries, event IDs and computed metrics are sent.
- Every model claim goes through the local Verification Agent plus a check that every number in the text matches a cited metric. Failing claims are shown struck through with reasons. If credentials are missing, the call fails/times out, or no claim verifies, the UI shows "Local template fallback" and the template recap stays.
- "Microsoft Foundry — live response verified" appears only after a real successful response with at least one verified claim.

### Foundry setup
Add three backend secrets (Lovable → Settings → Secrets; never in frontend code):
| Secret | Example |
|---|---|
| `AZURE_FOUNDRY_ENDPOINT` | `https://<resource>.openai.azure.com` or `.../openai/v1` (normalised; route never duplicated) |
| `AZURE_FOUNDRY_API_KEY` | key from Foundry portal → your deployment → Keys |
| `AZURE_FOUNDRY_MODEL` | your **deployment name**, e.g. `gpt-4o-mini` |

### Cost controls
- Click-only; one request per click; button disabled while playing or loading.
- `max_tokens` 450, `temperature` 0.2, JSON response format, at most 8 facts / 4 event IDs per fact in the prompt, max 6 claims parsed.
- 20 s timeout via AbortController. A small model deployment (e.g. gpt-4o-mini) is recommended.
- Keys are read only inside the server handler; logs record HTTP status only.

Tests: `src/lib/agents/foundry.test.ts` covers endpoint normalisation, malformed responses and claim verification.

## Next steps for submission
1. Connect GitHub from the Lovable editor (Settings → GitHub) and make the repo public. **No public repo exists yet.**
2. Publish from Lovable, or deploy the build to any edge host. **The app is not publicly hosted yet.**
3. Add the Foundry secrets above to enable live generation.
4. Record the demo using `DEMO_SCRIPT.md`.
