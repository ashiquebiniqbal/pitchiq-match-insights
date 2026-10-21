import { createServerFn } from "@tanstack/react-start";
import { generateMatch, DEFAULT_SEED } from "@/lib/match/generate";
import { computeStats, detectTurningPoints } from "@/lib/match/analytics";
import { matchAnalyst, type Audience } from "@/lib/agents/pipeline";
import {
  buildFoundryFacts,
  buildFoundryMessages,
  normalizeFoundryEndpoint,
  parseFoundryContent,
  FOUNDRY_MAX_TOKENS,
  FOUNDRY_TEMPERATURE,
  FOUNDRY_TIMEOUT_MS,
  type FoundryResult,
} from "@/lib/agents/foundry";

/** Only called on an explicit button click. Facts are recomputed server-side from the seeded match. */
export const generateFoundryRecap = createServerFn({ method: "POST" })
  .inputValidator((d: { t: number; audience: Audience }) => {
    const t = Number(d?.t);
    if (!Number.isFinite(t) || t < 0 || t > 5400) throw new Error("Invalid clock.");
    return { t: Math.floor(t), audience: d.audience === "analyst" ? "analyst" : "fan" } as const;
  })
  .handler(async ({ data }): Promise<FoundryResult> => {
    const endpoint = process.env["AZURE_FOUNDRY_ENDPOINT"];
    const key = process.env["AZURE_FOUNDRY_API_KEY"];
    const model = process.env["AZURE_FOUNDRY_MODEL"];
    if (!endpoint || !key || !model)
      return { ok: false, reason: "not_configured", message: "Microsoft Foundry isn't configured yet (endpoint, key or deployment name missing)." };
    let url: string;
    try {
      url = normalizeFoundryEndpoint(endpoint);
    } catch (e) {
      return { ok: false, reason: "not_configured", message: (e as Error).message };
    }
    const match = generateMatch(DEFAULT_SEED);
    const ctx = { match, t: data.t, stats: computeStats(match, data.t), events: match.events.filter((e) => e.t <= data.t), turningPoints: detectTurningPoints(match) };
    const facts = buildFoundryFacts(matchAnalyst(ctx).output);
    if (!facts.length) return { ok: false, reason: "malformed", message: "No match events yet — nothing to narrate." };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FOUNDRY_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", "api-key": key },
        body: JSON.stringify({
          model,
          messages: buildFoundryMessages(facts, data.audience),
          temperature: FOUNDRY_TEMPERATURE,
          max_tokens: FOUNDRY_MAX_TOKENS,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        console.error(`[foundry] HTTP ${res.status}`); // never log keys or bodies
        const msg = res.status === 401 || res.status === 403 ? "Foundry rejected the credentials." : res.status === 404 ? "Foundry endpoint or deployment name not found." : res.status === 429 ? "Foundry rate limit hit — try again shortly." : `Foundry returned HTTP ${res.status}.`;
        return { ok: false, reason: "http_error", message: msg };
      }
      const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
      try {
        return { ok: true, model, claims: parseFoundryContent(body?.choices?.[0]?.message?.content) };
      } catch (e) {
        return { ok: false, reason: "malformed", message: (e as Error).message };
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return { ok: false, reason: "timeout", message: `Foundry did not respond within ${FOUNDRY_TIMEOUT_MS / 1000}s.` };
      console.error("[foundry] network error");
      return { ok: false, reason: "network", message: "Could not reach Microsoft Foundry." };
    } finally {
      clearTimeout(timer);
    }
  });
