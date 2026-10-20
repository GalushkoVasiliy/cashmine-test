import {
  addUsd,
  displayUnits,
  formatUnits,
  formatUsd,
  normalizeInput,
  parseAmount,
  parseServerAmount,
  receiveAmount,
  sumUsd,
  toUsd,
  usdToCents,
  validateClaimAmount,
} from '..';

describe('parseAmount', () => {
  it.each([
    ['0', 18, 0n],
    ['12', 2, 1200n],
    ['0.5', 18, 500000000000000000n],
    ['1.000001', 6, 1000001n],
    ['0.00000001', 8, 1n],
    ['123456789012345678901234567890', 0, 123456789012345678901234567890n],
  ])('parses %s with %d decimals', (s, d, units) => {
    expect(parseAmount(s, d)).toEqual({ ok: true, units });
  });

  it('keeps precision past Number.MAX_SAFE_INTEGER', () => {
    const r = parseAmount('9007199254740993.000000000000000001', 18);
    expect(r).toEqual({ ok: true, units: 9007199254740993000000000000000001n });
  });

  it.each(['.5', '1.', '05', '00', '1e-3', '-1', '+1', ' 1', '1 ', '0,5', '1.2.3', 'abc', '0x10', 'Infinity', 'NaN'])(
    'rejects %p as FORMAT',
    (s) => {
      expect(parseAmount(s, 18)).toEqual({ ok: false, error: 'FORMAT' });
    },
  );

  it('rejects empty', () => {
    expect(parseAmount('', 8)).toEqual({ ok: false, error: 'EMPTY' });
  });

  it('rejects more fractional digits than decimals', () => {
    expect(parseAmount('0.123', 2)).toEqual({ ok: false, error: 'TOO_MANY_DECIMALS' });
    expect(parseAmount('1.0', 0)).toEqual({ ok: false, error: 'TOO_MANY_DECIMALS' });
    expect(parseAmount('0.12', 2)).toEqual({ ok: true, units: 12n });
  });

  it('accepts trailing zeros within decimals', () => {
    expect(parseAmount('1.50', 2)).toEqual({ ok: true, units: 150n });
  });
});

describe('parseServerAmount', () => {
  it('handles signed activity amounts', () => {
    expect(parseServerAmount('-0.25', 8)).toBe(-25000000n);
    expect(parseServerAmount('3', 8)).toBe(300000000n);
  });
  it('throws on malformed server data', () => {
    expect(() => parseServerAmount('1e5', 8)).toThrow();
  });
});

describe('formatUnits', () => {
  it.each([
    [0n, 18, '0'],
    [1n, 18, '0.000000000000000001'],
    [1500000000000000000n, 18, '1.5'],
    [1200n, 2, '12'],
    [7n, 0, '7'],
    [-25000000n, 8, '-0.25'],
  ])('formats %s @%d as %s', (u, d, s) => {
    expect(formatUnits(u, d)).toBe(s);
  });

  it('round-trips through the strict parser', () => {
    for (const s of ['0', '0.5', '12', '1.000001', '98765.4321']) {
      const r = parseAmount(s, 8);
      if (!r.ok) throw new Error('parse failed');
      expect(formatUnits(r.units, 8)).toBe(s);
    }
  });
});

describe('displayUnits', () => {
  it('groups thousands and marks truncation', () => {
    expect(displayUnits(123456789n, 2)).toBe('1,234,567.89');
    expect(displayUnits(1234567n, 6, 2)).toBe('1.23…');
    expect(displayUnits(1230000n, 6, 2)).toBe('1.23');
  });
});

describe('normalizeInput', () => {
  it('turns a single comma into a dot', () => {
    expect(normalizeInput('0,5')).toBe('0.5');
    expect(normalizeInput(' 12 ')).toBe('12');
  });
  it('leaves ambiguous input for the strict parser to reject', () => {
    expect(normalizeInput('1,000.5')).toBe('1,000.5');
    expect(normalizeInput('1,2,3')).toBe('1,2,3');
    expect(parseAmount(normalizeInput('1,000.5'), 8).ok).toBe(false);
  });
});

describe('fee / receive', () => {
  it('receive = amount - fee', () => {
    expect(receiveAmount(1000n, 15n)).toBe(985n);
  });
});

describe('validateClaimAmount', () => {
  const base = { decimals: 8, minAmount: '0.001', fee: '0.0005', available: '1.5' };

  it('accepts a valid amount and computes receive exactly', () => {
    expect(validateClaimAmount({ ...base, input: '0.1' })).toEqual({
      ok: true,
      amount: 10000000n,
      fee: 50000n,
      receive: 9950000n,
    });
  });

  it('accepts amount == minAmount and amount == available (inclusive bounds)', () => {
    expect(validateClaimAmount({ ...base, input: '0.001' }).ok).toBe(true);
    expect(validateClaimAmount({ ...base, input: '1.5' }).ok).toBe(true);
  });

  it('rejects below min, above available', () => {
    expect(validateClaimAmount({ ...base, input: '0.00099999' })).toEqual({ ok: false, error: 'BELOW_MIN' });
    expect(validateClaimAmount({ ...base, input: '1.50000001' })).toEqual({ ok: false, error: 'ABOVE_AVAILABLE' });
  });

  it('rejects when receive would be <= 0', () => {
    const p = { decimals: 8, minAmount: '0.0001', fee: '0.0005', available: '1' };
    expect(validateClaimAmount({ ...p, input: '0.0005' })).toEqual({ ok: false, error: 'RECEIVE_NOT_POSITIVE' });
    expect(validateClaimAmount({ ...p, input: '0.0004' })).toEqual({ ok: false, error: 'RECEIVE_NOT_POSITIVE' });
    expect(validateClaimAmount({ ...p, input: '0.00050001' }).ok).toBe(true);
  });

  it('passes through parse errors', () => {
    expect(validateClaimAmount({ ...base, input: '' })).toEqual({ ok: false, error: 'EMPTY' });
    expect(validateClaimAmount({ ...base, input: '.5' })).toEqual({ ok: false, error: 'FORMAT' });
    expect(validateClaimAmount({ ...base, input: '0.123456789' })).toEqual({ ok: false, error: 'TOO_MANY_DECIMALS' });
  });

  it('rejects everything when available is 0', () => {
    expect(validateClaimAmount({ ...base, available: '0', input: '0.001' })).toEqual({
      ok: false,
      error: 'ABOVE_AVAILABLE',
    });
  });
});

describe('USD totals', () => {
  it('multiplies exactly without floats', () => {
    // 0.1 + 0.2 style trap: 0.1 BTC * 0.3 and 0.2 * 0.3
    const a = toUsd(10000000n, 8, '0.3');
    const b = toUsd(20000000n, 8, '0.3');
    expect(formatUsd(addUsd(a, b))).toBe('$0.09');
  });

  it('sums assets with different decimals and price precisions', () => {
    const eth = toUsd(1500000000000000000n, 18, '3456.78'); // 1.5 ETH -> 5185.17
    const usdt = toUsd(12345678n, 6, '1.0001'); // 12.345678 -> 12.3469...
    const btc = toUsd(1n, 8, '67000'); // 1 sat -> 0.00067
    const total = sumUsd([eth, usdt, btc]);
    // exact: 5185.17 + 12.3469126678 + 0.00067 = 5197.5175826678
    expect(formatUsd(total)).toBe('$5,197.52');
  });

  it('rounds half-up only at display time', () => {
    expect(usdToCents({ value: 5n, scale: 3 })).toBe(1n); // 0.005 -> 0.01
    expect(usdToCents({ value: 4n, scale: 3 })).toBe(0n); // 0.004 -> 0.00
    // rounding each item first would give 0.00 + 0.00; summing exact gives 0.01
    const tiny = toUsd(4n, 3, '1');
    expect(formatUsd(sumUsd([tiny, tiny]))).toBe('$0.01');
  });

  it('handles empty totals and integer prices', () => {
    expect(formatUsd(sumUsd([]))).toBe('$0.00');
    expect(formatUsd(toUsd(200n, 2, '3'))).toBe('$6.00');
  });

  it('formats large values', () => {
    expect(formatUsd(toUsd(10n ** 24n, 18, '1234567.89'))).toBe('$1,234,567,890,000.00');
  });
});
