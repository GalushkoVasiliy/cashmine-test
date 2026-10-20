import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { isUnresolved } from '../claims/intents';
import { useBalances } from '../claims/useBalances';
import { Button, Card, colors, ErrorBox, s, Screen } from '../components/ui';
import { freshnessLabel, isStale, snapshotAgeMs } from '../lib/freshness';
import { useAuthedToken, useToken } from '../lib/token';
import { useNow } from '../lib/useNow';
import { displayUnits, formatUsd } from '../money';

export default function Home() {
  const token = useAuthedToken();
  const { clearToken } = useToken();
  const now = useNow();
  const { q, parsed, intents } = useBalances(token);
  const active = intents.filter(
    (i) => isUnresolved(i) || i.claim?.status === 'pending' || (i.claim?.status === 'failed' && now - Date.parse(i.claim.updatedAt) < 120_000),
  );

  const age = q.data ? snapshotAgeMs(q.data.asOf, now) : Infinity;
  const stale = q.data ? isStale(age) : false;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      >
        {q.isPending && <ActivityIndicator style={{ marginTop: 48 }} />}
        {q.isError && !q.data && <ErrorBox message={`Could not load balances: ${q.error.message}`} onRetry={() => q.refetch()} />}

        {parsed && !parsed.ok && <ErrorBox message={`Unexpected balance data: ${parsed.error}`} />}

        {active.map((i) => (
          <Pressable key={i.key} onPress={() => router.push(`/claims/${i.key}`)}>
            <Card style={{ borderColor: i.claim?.status === 'failed' ? colors.danger : colors.primary }}>
              <Text style={{ fontWeight: '600' }}>
                {i.claim?.status === 'failed'
                  ? `Claim of ${i.body.amount} ${i.body.asset} failed — the amount was returned to available.`
                  : isUnresolved(i)
                    ? `Checking claim of ${i.body.amount} ${i.body.asset}…`
                    : `Claim of ${i.body.amount} ${i.body.asset} is processing`}
              </Text>
              <Text style={[s.label, { marginTop: 4 }]}>Tap for status</Text>
            </Card>
          </Pressable>
        ))}

        {parsed?.ok && q.data && (
          <>
            <Card>
              <Text style={s.label}>Available to claim</Text>
              <Text style={[s.h1, { marginVertical: 4 }]}>{formatUsd(parsed.totals.available)}</Text>
              <Text style={s.label}>
                Pending {formatUsd(parsed.totals.pending)} · Claiming {formatUsd(parsed.totals.claiming)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
                <Text style={[s.label, stale && { color: colors.warn, fontWeight: '600' }]}>
                  {stale ? 'Stale · ' : ''}
                  {freshnessLabel(age)}
                </Text>
                {q.isFetching && <ActivityIndicator size="small" />}
              </View>
              {q.isError && (
                <Text style={{ color: colors.danger, marginTop: 6 }}>Refresh failed: {q.error.message}. Showing last data.</Text>
              )}
            </Card>

            {parsed.items.map((b) => (
              <Pressable key={b.asset} onPress={() => router.push({ pathname: '/claim', params: { asset: b.asset } })}>
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700' }}>{b.asset}</Text>
                    <Text style={s.value}>{formatUsd(b.availableUsd)}</Text>
                  </View>
                  <Row label="Available" value={displayUnits(b.available, b.decimals)} />
                  <Row label="Pending" value={displayUnits(b.pending, b.decimals)} />
                  <Row label="Claiming" value={displayUnits(b.claiming, b.decimals)} />
                  {b.updating && <Text style={[s.label, { color: colors.warn, marginTop: 4 }]}>Updating after your claim…</Text>}
                </Card>
              </Pressable>
            ))}
            {parsed.items.length === 0 && <Text style={s.label}>No balances yet.</Text>}

            <View style={{ gap: 12, marginTop: 8 }}>
              <Button title="Claim" onPress={() => router.push('/claim')} />
              <Button title="Activity" variant="secondary" onPress={() => router.push('/activity')} />
              <Button title="Refresh" variant="secondary" onPress={() => q.refetch()} />
            </View>
          </>
        )}

        <Pressable onPress={() => clearToken()} style={{ marginTop: 24, alignSelf: 'center' }}>
          <Text style={{ color: colors.primary }}>Change token</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}
