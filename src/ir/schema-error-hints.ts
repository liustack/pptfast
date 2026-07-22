import type { z } from "zod"
import { closestMatch } from "./suggest"

/**
 * zod v4 `error` callbacks for the IR schema's two large closed vocabularies
 * (`./index.ts`'s icon enum, used 5 times, and `ComponentSchema`'s `type`
 * discriminator) — borrow-wave task 3. Replaces zod's default "flatten every
 * valid value into the message" behavior (a real icon typo produces a
 * 24,910-char, 1756-option wall; a component-type typo produces a 437-char,
 * 28-option one — borrow-wave B report §3.3 #1/#2) with a nearest-neighbor
 * "did you mean" suggestion, a count, and a pointer to `pptfast schema`
 * (the CLI command that prints the full list on request) — never the
 * flattened enumeration itself.
 *
 * Both read their candidate list off the issue zod hands back
 * (`issue.values` / `issue.options`) rather than importing the schema's own
 * candidate array — one shared implementation for every call site, and zero
 * risk of the candidate list drifting from whichever enum/union instance
 * actually failed (see each function's own doc comment).
 */

const SCHEMA_POINTER = "see `pptfast schema` for the full list"

/**
 * Message-length ceiling this module's own test suite pins for both
 * functions below, regardless of enum/union size — the whole reason this
 * module exists is that a flattened-candidate-list message has no ceiling at
 * all (it grows with the vocabulary). 500 chars comfortably fits "not a
 * valid X — did you mean the longest plausible candidate name? (N valid X
 * values — see `pptfast schema`)" for every vocabulary this schema has today
 * or is likely to grow.
 */
export const ENUM_ERROR_MESSAGE_MAX_LENGTH = 500

function enumMismatchMessage(kind: string, input: unknown, candidates: readonly string[]): string {
  const count = candidates.length
  if (typeof input !== "string") {
    return `invalid ${kind} — expected one of ${count} valid ${kind} values (${SCHEMA_POINTER})`
  }
  const suggestion = closestMatch(input, candidates)
  const suggestPart = suggestion ? ` — did you mean "${suggestion}"?` : ""
  return `"${input}" is not a valid ${kind}${suggestPart} (${count} valid ${kind} values — ${SCHEMA_POINTER})`
}

/**
 * `error` callback for every `z.enum(PPTX_ICON_NAMES)` icon field. Only ever
 * called with an `invalid_value` issue (the one zod issue code `z.enum(...)`
 * can produce, whether the input was a wrong string or a non-string value
 * entirely — see this module's test file for both shapes) — `issue.input` is
 * the offending value itself for this issue code (unlike the discriminator
 * case below, there is no wrapping object to unwrap).
 */
export function iconEnumError(issue: z.core.$ZodRawIssue<z.core.$ZodIssueInvalidValue>): string {
  return enumMismatchMessage("icon name", issue.input, (issue.values ?? []).map(String))
}

/**
 * `error` callback for `ComponentSchema`'s `type` discriminator. zod only
 * invokes a discriminatedUnion's `error` callback for the "no branch's
 * discriminator literal matched" case (`issue.code === "invalid_union"`,
 * `issue.discriminator` set) — a mismatch *inside* an otherwise-correctly-
 * typed branch (e.g. a valid `type: "bullets"` with a malformed `items`)
 * resolves to that branch's own specific issues instead and never reaches
 * this function. `issue.input` for that case is the *whole* candidate object
 * being matched against the union (not just its `type` field), so the
 * discriminator value itself has to be read back out of it by
 * `issue.discriminator`'s own key name — read dynamically rather than
 * hardcoding `"type"` so this stays correct if the discriminator key name
 * ever changes.
 */
export function componentTypeError(issue: z.core.$ZodRawIssue<z.core.$ZodIssueInvalidUnion>): string {
  const options: z.core.util.Primitive[] = (issue as { options?: z.core.util.Primitive[] }).options ?? []
  const raw =
    issue.discriminator && typeof issue.input === "object" && issue.input !== null
      ? (issue.input as Record<string, unknown>)[issue.discriminator]
      : undefined
  return enumMismatchMessage("component type", raw, options.map(String))
}
