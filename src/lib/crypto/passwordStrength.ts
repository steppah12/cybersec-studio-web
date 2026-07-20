// A small built-in list of extremely common passwords. Real attackers try
// these FIRST, before brute force — a password can look fine by raw entropy
// math and still be trivially guessable if it's a known common password.
const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "123456789", "qwerty", "abc123", "password1",
  "111111", "123123", "admin", "letmein", "welcome", "monkey", "dragon",
  "master", "iloveyou", "sunshine", "princess", "football", "qwerty123",
  "solo", "starwars", "trustno1", "whatever", "freedom", "ninja", "azerty",
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

function estimateCharsetSize(password: string): number {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[^a-zA-Z0-9]/.test(password)) size += 32;
  return size || 1;
}

export function estimateEntropyBits(password: string): number {
  if (password.length === 0) return 0;
  return password.length * Math.log2(estimateCharsetSize(password));
}

export interface AttackScenario {
  label: string;
  speed: number; // guesses per second
}
export const ATTACK_SCENARIOS: AttackScenario[] = [
  { label: "Online, rate-limited (100 guesses/sec)", speed: 100 },
  { label: "Offline, slow hash e.g. bcrypt (10k guesses/sec)", speed: 1e4 },
  { label: "Offline, fast hash + GPU cluster (10B guesses/sec)", speed: 1e10 },
];

const CENTURY_SECONDS = 3_153_600_000;

export function formatDuration(seconds: number): string {
  if (seconds < 1) return "instant";
  if (!isFinite(seconds)) return "effectively never";
  if (seconds / CENTURY_SECONDS > 10000) return "effectively uncrackable (>10,000 centuries)";
  const units: [string, string, number][] = [
    ["century", "centuries", CENTURY_SECONDS],
    ["year", "years", 31_536_000],
    ["day", "days", 86400],
    ["hour", "hours", 3600],
    ["minute", "minutes", 60],
    ["second", "seconds", 1],
  ];
  for (const [singular, plural, secs] of units) {
    if (seconds >= secs) {
      const n = seconds / secs;
      return `~${n.toFixed(n > 100 ? 0 : 1)} ${n >= 2 ? plural : singular}`;
    }
  }
  return "instant";
}

export interface CrackTimeEstimate {
  label: string;
  time: string;
}

export function crackTimeEstimates(password: string): CrackTimeEstimate[] {
  if (isCommonPassword(password)) {
    return ATTACK_SCENARIOS.map((a) => ({ label: a.label, time: "instant \u2014 on the top-common-passwords list" }));
  }
  const entropyBits = estimateEntropyBits(password);
  const keyspace = Math.pow(2, entropyBits);
  // Average case is half the keyspace, per standard crack-time estimation practice.
  return ATTACK_SCENARIOS.map((a) => ({ label: a.label, time: formatDuration(keyspace / 2 / a.speed) }));
}

export interface BruteForceResult {
  found: boolean;
  candidate?: string;
  attempts: number;
  elapsedMs: number;
}

/**
 * A REAL brute-force attack, not a simulation — actually iterates every
 * combination of the given charset up to maxLength, timed for real. This is
 * deliberately capped by what's computationally feasible to run in a browser
 * in a few seconds, which naturally limits it to short/weak test passwords —
 * it cannot be turned into a general-purpose cracking tool against someone
 * else's real password by raising the cap, since the cost grows exponentially.
 */
export function bruteForce(target: string, charset: string, maxLength: number): BruteForceResult {
  const startTime = Date.now();
  let attempts = 0;

  function tryLength(length: number): BruteForceResult | null {
    const indices = new Array(length).fill(0);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempts++;
      const candidate = indices.map((i) => charset[i]).join("");
      if (candidate === target) {
        return { found: true, candidate, attempts, elapsedMs: Date.now() - startTime };
      }
      let pos = length - 1;
      while (pos >= 0) {
        indices[pos]++;
        if (indices[pos] < charset.length) break;
        indices[pos] = 0;
        pos--;
      }
      if (pos < 0) break;
    }
    return null;
  }

  for (let len = 1; len <= maxLength; len++) {
    const result = tryLength(len);
    if (result) return result;
  }
  return { found: false, attempts, elapsedMs: Date.now() - startTime };
}
