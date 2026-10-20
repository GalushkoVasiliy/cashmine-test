import type { BalanceItem } from '../api/types';
import { parseServerAmount } from './amount';
import { sumUsd, toUsd, Usd } from './usd';

export type ParsedBalance = {
  asset: string;
  decimals: number;
  available: bigint;
  pending: bigint;
  claiming: bigint;
  usdPrice: string;
  availableUsd: Usd;
};

export type BalanceTotals = { available: Usd; pending: Usd; claiming: Usd };

export function parseBalance(b: BalanceItem): ParsedBalance {
  const available = parseServerAmount(b.available, b.decimals);
  return {
    asset: b.asset,
    decimals: b.decimals,
    available,
    pending: parseServerAmount(b.pending, b.decimals),
    claiming: parseServerAmount(b.claiming, b.decimals),
    usdPrice: String(b.usdPrice),
    availableUsd: toUsd(available, b.decimals, String(b.usdPrice)),
  };
}

/** Headline = available in USD (claimable now); pending and claiming are reported separately. */
export function totals(items: ParsedBalance[]): BalanceTotals {
  return {
    available: sumUsd(items.map((i) => i.availableUsd)),
    pending: sumUsd(items.map((i) => toUsd(i.pending, i.decimals, i.usdPrice))),
    claiming: sumUsd(items.map((i) => toUsd(i.claiming, i.decimals, i.usdPrice))),
  };
}
