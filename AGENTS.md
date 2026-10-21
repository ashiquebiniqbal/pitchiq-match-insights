<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Match data comes only from `src/lib/match/generate.ts` (seeded); never use Math.random in analytics or UI — results must be reproducible and verifiable.
- Analytics and agent stages are pure functions in `src/lib/match` and `src/lib/agents`; UI components stay presentational so logic stays testable.
- Recap text may only be built from claims that passed `verifyClaims`; never label template output as AI-generated.
- Microsoft Foundry is called only from `src/lib/foundry.functions.ts` on explicit user click; model claims must pass `verifyFoundryClaims` before display, so model output is never trusted.
