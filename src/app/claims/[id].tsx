import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { api, qk } from '../../api/endpoints';
import { intentStore, tokenFingerprint, useIntents } from '../../claims/intents';
import { Button, Card, colors, ErrorBox, Line, s, Screen } from '../../components/ui';
import { useAuthedToken } from '../../lib/token';

/** Poll fast at first (claims settle in ~20s), then back off. 429s are handled by the client. */
function pollInterval(polls: number): number {
  return polls < 10 ? 2000 : 5000;
}

// The route param is the intent's Idempotency-Key, so the screen works (and
// resumes) before the server has given us a claim id.
export default function ClaimStatus() {
  const token = useAuthedToken();
  const qc = useQueryClient();
  const { id: key } = useLocalSearchParams<{ id: string }>();
  const intent = useIntents(tokenFingerprint(token)).find((i) => i.key === key);
  const claimId = intent?.claim?.id;
  const terminal = intent?.claim?.status === 'completed' || intent?.claim?.status === 'failed';

  const poll = useQuery({
    queryKey: qk.claim(token, claimId ?? ''),
    queryFn: () => api.claim(token, claimId!),
    enabled: !!claimId && !terminal,
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      if (st && st !== 'pending') return false;
      return pollInterval(query.state.dataUpdateCount);
    },
  });

  useEffect(() => {
    const c = poll.data;
    if (!c || !intent?.claim) return;
    if (c.status !== intent.claim.status || c.updatedAt !== intent.claim.updatedAt) {
      intentStore.update(intent.key, { claim: c });
      if (c.status !== 'pending') qc.invalidateQueries({ queryKey: qk.balances(token) });
    }
  }, [poll.data, intent, qc, token]);

  if (!intent) {
    return (
      <Screen>
        <View style={{ padding: 16 }}>
          <ErrorBox message="This claim is not known on this device." />
          <Button title="Home" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }

  const c = intent.claim;
  const asset = intent.body.asset;

  let title: string;
  let detail: string;
  let tone = colors.text;
  if (intent.state === 'sending') {
    title = 'Sending claim…';
    detail = 'Waiting for the server.';
  } else if (intent.state === 'unknown') {
    title = 'Checking your claim…';
    detail =
      "We couldn't confirm it yet because the server was slow or unreachable. We keep re-sending the exact same request, so it can never be created twice. Your money is safe.";
    tone = colors.warn;
  } else if (intent.state === 'rejected') {
    const e = intent.error;
    title = 'Claim not created';
    detail =
      e?.code === 'IDEMPOTENCY_MISMATCH'
        ? 'Internal error: the request changed under the same key. Nothing was claimed. Please start again.'
        : `${e?.message ?? 'The server rejected the claim.'} Nothing was claimed.`;
    tone = colors.danger;
  } else if (c?.status === 'completed') {
    title = 'Claim completed';
    detail = `${c.receiveAmount} ${asset} is on its way to your destination.`;
    tone = colors.ok;
  } else if (c?.status === 'failed') {
    title = 'Claim failed';
    detail = `${c.failureReason ?? 'The claim could not be completed.'} ${c.amount} ${asset} was returned to your available balance.`;
    tone = colors.danger;
  } else {
    title = 'Processing…';
    detail = 'Claims usually settle within about 20 seconds.';
  }

  const busy = intent.state === 'sending' || intent.state === 'unknown' || c?.status === 'pending';

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {busy && <ActivityIndicator />}
            <Text style={{ fontSize: 20, fontWeight: '700', color: tone }}>{title}</Text>
          </View>
          <Text style={{ color: colors.text }}>{detail}</Text>
          {poll.isError && <Text style={[s.label, { marginTop: 8 }]}>Status check failed, retrying…</Text>}
        </Card>
        <Card>
          <Line label="Amount" value={`${c?.amount ?? intent.body.amount} ${asset}`} />
          {c && <Line label="Fee" value={`${c.fee} ${asset}`} />}
          {c && <Line label="You receive" value={`${c.receiveAmount} ${asset}`} strong />}
          {c && <Line label="Claim id" value={c.id} />}
        </Card>
        <View style={{ gap: 8 }}>
          {intent.state === 'rejected' && (
            <Button
              title="Edit and try again"
              onPress={() => {
                qc.invalidateQueries({ queryKey: qk.balances(token) });
                router.replace({ pathname: '/claim', params: { asset } });
              }}
            />
          )}
          <Button title="Home" variant="secondary" onPress={() => router.replace('/')} />
        </View>
      </ScrollView>
    </Screen>
  );
}
