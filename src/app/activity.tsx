import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { api, qk } from '../api/endpoints';
import { Button, colors, ErrorBox, s, Screen } from '../components/ui';
import { dedupeById } from '../lib/activity';
import { useAuthedToken } from '../lib/token';

export default function Activity() {
  const token = useAuthedToken();
  const q = useInfiniteQuery({
    queryKey: qk.activity(token),
    queryFn: ({ pageParam }) => api.activity(token, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const qc = useQueryClient();
  // Pull-to-refresh reloads only the first page (reset drops the older pages and their cursors).
  const refreshFirstPage = () => void qc.resetQueries({ queryKey: qk.activity(token) });
  const items = useMemo(() => dedupeById(q.data?.pages.map((p) => p.items) ?? []), [q.data]);

  if (q.isPending) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (q.isError && !q.data)
    return (
      <Screen>
        <View style={{ padding: 16 }}>
          <ErrorBox message={`Could not load activity: ${q.error.message}`} onRetry={() => q.refetch()} />
        </View>
      </Screen>
    );

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={refreshFirstPage} />}
        renderItem={({ item }) => (
          <View style={[s.card, { marginBottom: 8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600' }}>
                {item.type === 'accrual' ? 'Payback' : item.type === 'reversal' ? 'Reversal' : 'Claim'}
                {item.exchange ? ` · ${item.exchange}` : ''}
              </Text>
              <Text style={[s.value, { color: item.amount.startsWith('-') ? colors.danger : colors.ok }]}>
                {item.amount.startsWith('-') ? '' : '+'}
                {item.amount} {item.asset}
              </Text>
            </View>
            <Text style={s.label}>
              {item.status} · {new Date(item.createdAt).toLocaleString()}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={s.label}>No activity yet.</Text>}
        ListFooterComponent={
          q.hasNextPage ? (
            <Button title="Load more" variant="secondary" loading={q.isFetchingNextPage} onPress={() => q.fetchNextPage()} />
          ) : undefined
        }
      />
    </Screen>
  );
}
