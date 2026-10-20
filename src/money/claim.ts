import { parseAmount, parseServerAmount, ParseError } from './amount';

export type ClaimAmountError = ParseError | 'BELOW_MIN' | 'ABOVE_AVAILABLE' | 'RECEIVE_NOT_POSITIVE';

export type ClaimAmountInput = {
  /** Already normalised user input (see normalizeInput). */
  input: string;
  decimals: number;
  minAmount: string;
  fee: string;
  available: string;
};

export type ClaimAmountResult =
  | { ok: true; amount: bigint; fee: bigint; receive: bigint }
  | { ok: false; error: ClaimAmountError };

/** The fee is taken from the amount: receive = amount - fee. */
export function receiveAmount(amount: bigint, fee: bigint): bigint {
  return amount - fee;
}

/**
 * Client-side mirror of the server rules: strict format, <= decimals places,
 * minAmount <= amount <= available, and receive > 0.
 * The server still checks `available` live; this is only for fast feedback.
 */
export function validateClaimAmount(p: ClaimAmountInput): ClaimAmountResult {
  const parsed = parseAmount(p.input, p.decimals);
  if (!parsed.ok) return parsed;
  const amount = parsed.units;
  const min = parseServerAmount(p.minAmount, p.decimals);
  const fee = parseServerAmount(p.fee, p.decimals);
  const available = parseServerAmount(p.available, p.decimals);
  if (amount < min) return { ok: false, error: 'BELOW_MIN' };
  if (amount > available) return { ok: false, error: 'ABOVE_AVAILABLE' };
  const receive = receiveAmount(amount, fee);
  if (receive <= 0n) return { ok: false, error: 'RECEIVE_NOT_POSITIVE' };
  return { ok: true, amount, fee, receive };
}

export const CLAIM_ERROR_TEXT: Record<ClaimAmountError, string> = {
  EMPTY: 'Enter an amount',
  FORMAT: 'Enter a number like 0.5',
  TOO_MANY_DECIMALS: 'Too many decimal places',
  BELOW_MIN: 'Below the minimum claim amount',
  ABOVE_AVAILABLE: 'More than your available balance',
  RECEIVE_NOT_POSITIVE: 'Amount must be larger than the fee',
};
