import { parseServerAmount } from './amount';

/**
 * An exact USD value: `value / 10^scale` dollars. Kept unrounded until display.
 */
export type Usd = { value: bigint; scale: number };

export const USD_ZERO: Usd = { value: 0n, scale: 0 };

function priceScale(price: string): number {
  const dot = price.indexOf('.');
  return dot === -1 ? 0 : price.length - dot - 1;
}

/** amount (in units, `decimals` places) × usdPrice (decimal string), exact. */
export function toUsd(units: bigint, decimals: number, usdPrice: string): Usd {
  const ps = priceScale(usdPrice);
  const price = parseServerAmount(usdPrice, ps);
  return { value: units * price, scale: decimals + ps };
}

function rescale(u: Usd, scale: number): bigint {
  return u.value * 10n ** BigInt(scale - u.scale);
}

export function addUsd(a: Usd, b: Usd): Usd {
  const scale = Math.max(a.scale, b.scale);
  return { value: rescale(a, scale) + rescale(b, scale), scale };
}

export function sumUsd(items: Usd[]): Usd {
  return items.reduce(addUsd, USD_ZERO);
}

/** Round half-up (away from zero) to cents. Only for display. */
export function usdToCents(u: Usd): bigint {
  if (u.scale <= 2) return u.value * 10n ** BigInt(2 - u.scale);
  const div = 10n ** BigInt(u.scale - 2);
  const negative = u.value < 0n;
  const abs = negative ? -u.value : u.value;
  const q = abs / div;
  const r = abs % div;
  const rounded = r * 2n >= div ? q + 1n : q;
  return negative ? -rounded : rounded;
}

export function formatUsd(u: Usd): string {
  const cents = usdToCents(u);
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${whole}.${frac}`;
}
