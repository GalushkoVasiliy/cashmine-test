import { parseServerAmount } from '../money/amount';
import type { ParsedBalance } from '../money/balances';
import { toUsd } from '../money/usd';
import type { ClaimIntent } from './intents';

export type OverlaidBalance = ParsedBalance & { updating: boolean };

/**
 * Balances snapshots lag up to ~15s behind a new claim. Until a snapshot with
 * asOf >= claim.createdAt arrives, move the claim's amount from available to
 * claiming locally, so the user does not see (or Max) money that already left.
 * Unresolved intents (sending/unknown) are treated the same way: the money may
 * have left, so it is safer not to offer it again.
 * Failed claims are not overlaid: the amount is back in available.
 */
export function applyOverlay(items: ParsedBalance[], asOf: string, intents: ClaimIntent[]): OverlaidBalance[] {
  const asOfMs = Date.parse(asOf);
  return items.map((b) => {
    let moved = 0n;
    for (const i of intents) {
      if (i.body.asset !== b.asset) continue;
      if (i.state === 'rejected') continue;
      if (i.state === 'created') {
        const c = i.claim!;
        if (c.status === 'failed') continue;
        if (asOfMs >= Date.parse(c.createdAt)) continue; // snapshot already includes it
      }
      moved += parseServerAmount(i.body.amount, b.decimals);
    }
    if (moved === 0n) return { ...b, updating: false };
    const shift = moved > b.available ? b.available : moved;
    const available = b.available - shift;
    return {
      ...b,
      available,
      claiming: b.claiming + shift,
      availableUsd: toUsd(available, b.decimals, b.usdPrice),
      updating: true,
    };
  });
}
