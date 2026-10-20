import type { ActivityItem } from '../../api/types';
import { dedupeById } from '../activity';

const item = (id: string): ActivityItem => ({
  id,
  type: 'accrual',
  asset: 'BTC',
  amount: '0.1',
  status: 'confirmed',
  exchange: 'Binance',
  createdAt: '2026-10-20T20:00:00Z',
  relatedId: null,
});

it('dedupes overlapping pages by id, keeping order', () => {
  expect(dedupeById([[item('a'), item('b')], [item('b'), item('c')]]).map((i) => i.id)).toEqual(['a', 'b', 'c']);
});
