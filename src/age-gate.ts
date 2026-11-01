// Age gate store — LEAD-OWNED shared module (see design/review-log.md).
// Lane B: wraps these in POST /api/age-gate + signup (markAgeVerified on DOB pass).
// Lane C: imports hasAgeGate read-only for /api/match enforcement.
// In-memory by design: no teammate schema/migration edits. Guest attestations are
// ephemeral (12h TTL, lost on restart — guests simply re-attest); verified accounts
// (DOB-checked at signup) persist for the process lifetime. /privacy must disclose
// that the guest gate is a self-attestation, not age verification.

const attestations = new Map<string, number>();
const verified = new Set<string>();
const ATTEST_TTL_MS = 12 * 60 * 60 * 1000;

/** Lane B (POST /api/age-gate): record a guest 13+ attestation for this user. */
export function markAgeAttested(userId: string): void {
  if (!userId) throw new Error("userId required");
  attestations.set(userId, Date.now());
}

/** Lane B (signup): record a DOB-verified 13+ account (no expiry). */
export function markAgeVerified(userId: string): void {
  if (!userId) throw new Error("userId required");
  verified.add(userId);
}

/** Lane C (/api/match): true when this user passed the guest attestation or DOB check. */
export function hasAgeGate(userId: string): boolean {
  if (verified.has(userId)) return true;
  const at = attestations.get(userId);
  if (at === undefined) return false;
  if (Date.now() - at > ATTEST_TTL_MS) {
    attestations.delete(userId);
    return false;
  }
  return true;
}
