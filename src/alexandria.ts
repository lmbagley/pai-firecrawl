// Alexandria spend guard — pure functions, no I/O.
//
// Rule: discover before you retrieve. A paid Alexandria call is only sent for a
// capability the catalogue returned for exactly that provider + capability, at a
// price we could read, inside a credit cap the caller stated. Everything that is
// not an explicit, parsed, in-budget price refuses (fail closed).

import type { CatalogueItem } from "./types.ts";

/** Option names that bound how many records a perRecord capability returns. */
export const LIMIT_OPTION_NAMES = ["limit", "per_page", "page_size", "count", "max_results", "size"] as const;

/** Exact match only — never trust a server-side filter to not return near matches. */
export function findExactContract(
  items: CatalogueItem[],
  provider: string,
  capability: string,
): CatalogueItem | undefined {
  return items.find((i) => i.provider === provider && i.capability === capability);
}

/** "1 credit" / "5 credits". */
export const credits = (n: number): string => `${n} credit${n === 1 ? "" : "s"}`;

const present = (v: unknown): boolean => v !== undefined && v !== null && v !== "";

/** requiresOneOf groups (at least one member each) that the options leave empty. */
export function missingOneOfGroups(contract: CatalogueItem, options: Record<string, unknown>): string[][] {
  const groups = contract.requiresOneOf ?? [];
  return groups.filter((g) => g.length > 0 && !g.some((name) => present(options[name])));
}

/** Options the contract marks `required: true` that the options leave empty. */
export function missingRequired(contract: CatalogueItem, options: Record<string, unknown>): string[] {
  return (contract.options ?? []).filter((o) => o.required === true && !present(options[o.name])).map((o) => o.name);
}

const wholeAtLeastOne = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1;

export type RecordBound = { records: number; why: string } | { error: string } | undefined;

/**
 * The most records a perRecord call can bill for. Only a limit option the
 * CONTRACT declares counts (the server ignores an undeclared `limit`, so it
 * bounds nothing), it must be a whole number >= 1, and it is clamped to the
 * contract's own `max`. In order: the caller's value for a declared limit; the
 * contract's `max` on a declared limit; the caller's --assume-records. Returns
 * undefined when nothing bounds it, or { error } for an unusable value.
 */
export function recordBound(
  contract: CatalogueItem,
  options: Record<string, unknown>,
  assumeRecords?: number,
): RecordBound {
  const declared = (contract.options ?? []).filter((o) => (LIMIT_OPTION_NAMES as readonly string[]).includes(o.name));
  const contractMax = (o: (typeof declared)[number]) => (wholeAtLeastOne(o.max) ? o.max : undefined);

  for (const o of declared) {
    const v = options[o.name];
    if (v === undefined || v === null) continue;
    if (!wholeAtLeastOne(v)) return { error: `${o.name} must be a whole number of at least 1, got ${JSON.stringify(v)}` };
    const max = contractMax(o);
    const records = max !== undefined ? Math.min(v, max) : v;
    return { records, why: `${o.name}=${records}${max !== undefined && v > max ? ` (contract max)` : ""}` };
  }
  for (const o of declared) {
    const max = contractMax(o);
    if (max !== undefined) return { records: max, why: `contract max ${o.name}=${max}` };
  }

  // Array inputs are deliberately NOT used as a bound: in the live catalogue
  // (2026-09-29) some are per-item inputs (apollo bulk-enrich domains[]) and
  // some are filters (headcounts), and the contract does not say which.
  if (assumeRecords !== undefined) {
    if (!wholeAtLeastOne(assumeRecords)) return { error: `--assume-records must be a whole number of at least 1` };
    return { records: assumeRecords, why: `your --assume-records ${assumeRecords}; the contract does not bound it` };
  }
  return undefined;
}

export type SpendPlan =
  | { ok: true; price: number; worstCase: number; perRecord: boolean; note: string }
  | { ok: false; reason: string };

/**
 * Decide whether a call may be sent, and what it can cost at most.
 * `maxCredits` undefined means the caller stated no cap: only a free call passes.
 */
export function planSpend(
  contract: CatalogueItem,
  options: Record<string, unknown>,
  maxCredits: number | undefined,
  assumeRecords?: number,
): SpendPlan {
  const id = `${contract.provider}/${contract.capability}`;
  if (maxCredits !== undefined && !(Number.isSafeInteger(maxCredits) && maxCredits >= 0)) {
    return { ok: false, reason: `--max-credits must be a whole number of 0 or more, got ${maxCredits}` };
  }
  const price = contract.creditsCost;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    return { ok: false, reason: `the catalogue gave no readable price for ${id}; refusing to spend blind` };
  }

  const missing = missingRequired(contract, options);
  if (missing.length) return { ok: false, reason: `${id} requires option(s): ${missing.join(", ")}` };
  const groups = missingOneOfGroups(contract, options);
  if (groups.length) {
    return {
      ok: false,
      reason: `${id} needs at least one of each group: ${groups.map((g) => `[${g.join(" | ")}]`).join(", ")}`,
    };
  }

  if (typeof contract.perRecord !== "boolean") {
    return { ok: false, reason: `the catalogue did not say whether ${id} bills per call or per record; refusing to spend blind` };
  }
  const perRecord = contract.perRecord;
  let worstCase = price;
  let note = `${credits(price)} per call`;
  if (perRecord && price > 0) {
    const bound = recordBound(contract, options, assumeRecords);
    if (bound && "error" in bound) return { ok: false, reason: `${id}: ${bound.error}` };
    if (!bound) {
      const limits = (contract.options ?? []).map((o) => o.name).filter((n) => (LIMIT_OPTION_NAMES as readonly string[]).includes(n));
      return {
        ok: false,
        reason:
          `${id} is billed ${credits(price)} per record and nothing bounds how many records it returns, ` +
          `so the cost is unbounded. ` +
          (limits.length ? `Set ${limits.join(" or ")} in --options, ` : `Its contract declares no limit option, so `) +
          `state your own bound with --assume-records <n>.`,
      };
    }
    worstCase = price * bound.records;
    note = `${credits(price)} per record, at most ${worstCase} (${bound.why})`;
  } else if (perRecord) {
    note = `${credits(price)} per record`;
  }

  if (worstCase > 0 && maxCredits === undefined) {
    return {
      ok: false,
      reason: `${id} costs ${note}. Paid calls need an explicit budget: add --max-credits <n>.`,
    };
  }
  if (maxCredits !== undefined && worstCase > maxCredits) {
    return { ok: false, reason: `${id} costs ${note}, over --max-credits ${maxCredits}` };
  }
  return { ok: true, price, worstCase, perRecord, note };
}

/** Warnings when the bill does not match what we planned (price moved, or billing differs). */
export function overageWarnings(plan: { worstCase: number; note: string }, actual: unknown, maxCredits?: number): string[] {
  const w: string[] = [];
  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    return [`WARNING: Firecrawl did not report a readable charge (${JSON.stringify(actual)}); check the balance with: firecrawl usage`];
  }
  if (actual > plan.worstCase) w.push(`WARNING: charged ${credits(actual)}, above the planned ${plan.note}`);
  if (maxCredits !== undefined && actual > maxCredits) w.push(`WARNING: charged ${credits(actual)}, over --max-credits ${maxCredits}`);
  return w;
}
