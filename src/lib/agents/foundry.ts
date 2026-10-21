/**
 * Pure, browser-safe helpers for the optional Microsoft Foundry narrative step.
 * The model only rewords verified facts; every returned claim is re-checked by
 * the local Verification Agent (verifyClaims) and a text-number guard.
 */
import type { Audience, DraftClaim, Fact, PipelineContext, VerifiedClaim } from "./pipeline";
import { verifyClaims } from "./pipeline";

export const FOUNDRY_TIMEOUT_MS = 20_000;
export const FOUNDRY_MAX_TOKENS = 450;
export const FOUNDRY_TEMPERATURE = 0.2;
export const FOUNDRY_MAX_CLAIMS = 6;

/** Normalise a Foundry / Azure OpenAI endpoint to `<origin>/openai/v1/chat/completions` without duplicating segments. */
export function normalizeFoundryEndpoint(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("AZURE_FOUNDRY_ENDPOINT is not a valid URL.");
  }
  if (u.protocol !== "https:") throw new Error("AZURE_FOUNDRY_ENDPOINT must use https.");
  let p = u.pathname.replace(/\/+$/, "");
  p = p.replace(/\/chat\/completions$/, "");
  if (/\/openai\/v1$/.test(p)) {
    /* already correct */
  } else if (/\/openai$/.test(p)) p += "/v1";
  else if (/\/v1$/.test(p)) {
    /* e.g. models endpoint already ending in /v1 */
  } else p += "/openai/v1";
  return `${u.origin}${p}/chat/completions`;
}

export interface FoundryFactInput {
  id: string;
  summary: string;
  eventIds: string[];
  metrics: { key: string; value: number }[];
}

/** Compact, synthetic-only payload — no player PII, no raw event log. */
export function buildFoundryFacts(facts: Fact[]): FoundryFactInput[] {
  return facts.slice(0, 8).map((f) => ({ id: f.id, summary: f.summary, eventIds: f.eventIds.slice(-4), metrics: f.metrics }));
}

export function buildFoundryMessages(facts: FoundryFactInput[], audience: Audience) {
  const system =
    "You write short football recaps for a SYNTHETIC match. Use ONLY the facts given. " +
    "Return strict JSON: {\"claims\":[{\"text\":string,\"factId\":string,\"eventIds\":string[],\"metrics\":[{\"key\":string,\"value\":number}]}]}. " +
    `Max ${FOUNDRY_MAX_CLAIMS} claims, each under 30 words. Every number in text must appear in that claim's metrics, copied exactly from the fact. ` +
    "eventIds and metric keys must be copied from the referenced fact. No other keys, no prose outside JSON.";
  const user = `Audience: ${audience === "fan" ? "casual fan, vivid but factual" : "tactical analyst, precise"}.\nFacts:\n${JSON.stringify(facts)}`;
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

export interface FoundryClaimRaw {
  text: string;
  factId: string;
  eventIds: string[];
  metrics: { key: string; value: number }[];
}

/** Parse a model message into claims. Throws on anything malformed. */
export function parseFoundryContent(content: unknown): FoundryClaimRaw[] {
  if (typeof content !== "string" || !content.trim()) throw new Error("Empty model response.");
  const json = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error("Model response was not valid JSON.");
  }
  const claims = (obj as { claims?: unknown })?.claims;
  if (!Array.isArray(claims) || !claims.length) throw new Error("Model response has no claims array.");
  return claims.slice(0, FOUNDRY_MAX_CLAIMS).map((c, i) => {
    const r = c as { text?: unknown; factId?: unknown; eventIds?: unknown; metrics?: unknown };
    if (typeof r.text !== "string" || !r.text.trim()) throw new Error(`Claim ${i + 1} has no text.`);
    const eventIds = Array.isArray(r.eventIds) ? r.eventIds.filter((x): x is string => typeof x === "string") : [];
    const metrics = Array.isArray(r.metrics)
      ? r.metrics
          .map((m) => m as { key?: unknown; value?: unknown })
          .filter((m) => typeof m.key === "string" && typeof m.value === "number" && Number.isFinite(m.value))
          .map((m) => ({ key: m.key as string, value: m.value as number }))
      : [];
    return { text: r.text.trim().slice(0, 300), factId: typeof r.factId === "string" ? r.factId : "none", eventIds, metrics };
  });
}

/** Numbers written in the text must match a cited metric value (or a minute of a cited event). */
export function textNumberIssues(c: DraftClaim, ctx: PipelineContext): string[] {
  const allowed = new Set<number>(c.citedValues.map((v) => v.value));
  for (const id of c.eventIds) {
    const e = ctx.match.events.find((x) => x.id === id);
    if (e) allowed.add(e.minute);
  }
  const nums = (c.text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  return nums.filter((n) => ![...allowed].some((a) => Math.abs(a - n) < 1e-6)).map((n) => `Text number ${n} is not backed by a cited metric.`);
}

export function verifyFoundryClaims(raw: FoundryClaimRaw[], ctx: PipelineContext): VerifiedClaim[] {
  const drafts: DraftClaim[] = raw.map((r, i) => ({ id: `M${i + 1}`, factId: r.factId, kind: "injected", text: r.text, citedValues: r.metrics, eventIds: r.eventIds, slots: {} }));
  return verifyClaims(drafts, ctx).output.map((v) => {
    const extra = textNumberIssues(v, ctx);
    const reasons = [...v.reasons, ...extra];
    return { ...v, reasons, status: reasons.length ? "fail" : "pass" };
  });
}

export type FoundryResult =
  | { ok: true; model: string; claims: FoundryClaimRaw[] }
  | { ok: false; reason: "not_configured" | "timeout" | "http_error" | "malformed" | "network"; message: string };
