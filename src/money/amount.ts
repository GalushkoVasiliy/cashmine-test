// Amounts are held as BigInt in the asset's smallest unit ("units").
// A value of 1.5 ETH with decimals = 18 is 1_500_000_000_000_000_000n.
// JS numbers are never used for money.

const STRICT_RE = /^(0|[1-9]\d*)(\.\d+)?$/;

export type ParseError = 'EMPTY' | 'FORMAT' | 'TOO_MANY_DECIMALS';

export type ParseResult =
  | { ok: true; units: bigint }
  | { ok: false; error: ParseError };

/**
 * Strict parse of an API-format decimal string ("0.5", "12").
 * Rejects ".5", "1.", "05", "1e-3", "-1", "+1", whitespace, commas.
 */
export function parseAmount(input: string, decimals: number): ParseResult {
  if (input === '') return { ok: false, error: 'EMPTY' };
  const m = STRICT_RE.exec(input);
  if (!m) return { ok: false, error: 'FORMAT' };
  const whole = m[1];
  const frac = m[2] ? m[2].slice(1) : '';
  if (frac.length > decimals) return { ok: false, error: 'TOO_MANY_DECIMALS' };
  const units = BigInt(whole + frac.padEnd(decimals, '0'));
  return { ok: true, units };
}

/** Parse a value the server sent us. Throws: malformed server data is a bug, not user input. */
export function parseServerAmount(input: string, decimals: number): bigint {
  const negative = input.startsWith('-');
  const r = parseAmount(negative ? input.slice(1) : input, decimals);
  if (!r.ok) throw new Error(`Malformed amount from server: "${input}" (${r.error})`);
  return negative ? -r.units : r.units;
}

/**
 * Turn units back into an API-format string. Trailing fractional zeros are
 * dropped so the output always matches the strict format ("1.5", never "1.50" or "1.").
 */
export function formatUnits(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const s = abs.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return (negative ? '-' : '') + (frac ? `${whole}.${frac}` : whole);
}

/** Display format: thousands separators on the whole part, optional max fraction digits (truncated, not rounded). */
export function displayUnits(units: bigint, decimals: number, maxFraction = decimals): string {
  const plain = formatUnits(units, decimals);
  const negative = plain.startsWith('-');
  const [whole, frac = ''] = (negative ? plain.slice(1) : plain).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const shownFrac = frac.slice(0, maxFraction).replace(/0+$/, '');
  const truncated = shownFrac.length < frac.length && frac.slice(shownFrac.length).replace(/0/g, '') !== '';
  return (negative ? '-' : '') + grouped + (shownFrac ? `.${shownFrac}` : '') + (truncated ? '…' : '');
}

/**
 * Input-field normalisation only (user's call: accept "0,5").
 * Trims spaces and turns a single comma into a dot. The result still goes
 * through the strict parser; nothing non-strict is ever sent to the API.
 */
export function normalizeInput(raw: string): string {
  const trimmed = raw.trim();
  const commas = trimmed.split(',').length - 1;
  if (commas === 1 && !trimmed.includes('.')) return trimmed.replace(',', '.');
  return trimmed;
}
