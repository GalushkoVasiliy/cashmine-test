import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { api, qk } from '../api/endpoints';
import { intentStore, isUnresolved, newIdempotencyKey, tokenFingerprint } from '../claims/intents';
import { useBalances } from '../claims/useBalances';
import { Button, Card, colors, ErrorBox, Line, s, Screen } from '../components/ui';
import { useAuthedToken } from '../lib/token';
import { CLAIM_ERROR_TEXT, displayUnits, formatUnits, normalizeInput, validateClaimAmount } from '../money';

export default function ClaimScreen() {
  const token = useAuthedToken();
  const params = useLocalSearchParams<{ asset?: string }>();
  const { q, parsed, intents } = useBalances(token);
  const [asset, setAsset] = useState<string | undefined>(params.asset);
  const [input, setInput] = useState('');
  const [touched, setTouched] = useState(false);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const submitted = useRef(false);

  const items = parsed?.ok ? parsed.items : [];
  const selected = items.find((b) => b.asset === asset) ?? items[0];

  const opts = useQuery({
    queryKey: qk.claimOptions(token, selected?.asset ?? ''),
    queryFn: () => api.claimOptions(token, selected!.asset),
    enabled: !!selected,
  });

  const active = intents.find(isUnresolved);
  if (active) {
    return (
      <Screen>
        <View style={{ padding: 16 }}>
          <Card>
            <Text style={{ marginBottom: 12 }}>
              Your claim of {active.body.amount} {active.body.asset} is still being confirmed. Wait for it before starting a new one.
            </Text>
            <Button title="View status" onPress={() => router.replace(`/claims/${active.key}`)} />
          </Card>
        </View>
      </Screen>
    );
  }

  if (q.isPending) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!parsed?.ok || !selected) {
    return (
      <Screen>
        <View style={{ padding: 16 }}>
          <ErrorBox message={q.error ? `Could not load balances: ${q.error.message}` : 'No assets to claim.'} onRetry={() => q.refetch()} />
        </View>
      </Screen>
    );
  }

  const o = opts.data;
  const dest = o?.destinations.find((d) => d.id === destinationId) ?? o?.destinations[0];
  const normalized = normalizeInput(input);
  const v = o
    ? validateClaimAmount({
        input: normalized,
        decimals: selected.decimals,
        minAmount: o.minAmount,
        fee: o.fee,
        available: formatUnits(selected.available, selected.decimals),
      })
    : null;
  const showError = v && !v.ok && (touched || v.error !== 'EMPTY');

  const pickAsset = (a: string) => {
    setAsset(a);
    setInput('');
    setTouched(false);
    setDestinationId(null);
  };

  const confirm = () => {
    // Double-submit guard: one confirmed intent per screen visit.
    if (submitted.current || !v?.ok || !dest) return;
    submitted.current = true;
    const key = newIdempotencyKey();
    // Persist key + exact body BEFORE sending; the runner sends it.
    intentStore.add({
      key,
      owner: tokenFingerprint(token),
      body: { asset: selected.asset, amount: formatUnits(v.amount, selected.decimals), destinationId: dest.id },
      decimals: selected.decimals,
      createdAtLocal: Date.now(),
      state: 'sending',
    });
    setConfirming(false);
    router.replace(`/claims/${key}`);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={[s.label, { marginBottom: 8 }]}>Asset</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {items.map((b) => (
            <Chip key={b.asset} label={b.asset} active={b.asset === selected.asset} onPress={() => pickAsset(b.asset)} />
          ))}
        </View>

        <Card>
          <Text style={s.label}>Available</Text>
          <Text style={[s.value, { fontSize: 20, fontWeight: '600' }]}>
            {displayUnits(selected.available, selected.decimals)} {selected.asset}
          </Text>
          {selected.updating && <Text style={[s.label, { color: colors.warn }]}>Updating after your recent claim</Text>}
        </Card>

        {opts.isPending && <ActivityIndicator />}
        {opts.isError && <ErrorBox message={`Could not load claim options: ${opts.error.message}`} onRetry={() => opts.refetch()} />}

        {o && (
          <>
            <Text style={[s.label, { marginBottom: 8 }]}>Amount</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[s.input, { flex: 1 }, showError ? { borderColor: colors.danger } : null]}
                value={input}
                onChangeText={setInput}
                onBlur={() => setTouched(true)}
                placeholder={`Min ${o.minAmount}`}
                inputMode="decimal"
                keyboardType="decimal-pad"
                autoCorrect={false}
              />
              <Pressable
                onPress={() => {
                  setInput(formatUnits(selected.available, selected.decimals));
                  setTouched(true);
                }}
                style={{ justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.primary }}
              >
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Max</Text>
              </Pressable>
            </View>
            {showError && <Text style={{ color: colors.danger, marginTop: 6 }}>{CLAIM_ERROR_TEXT[v.error]}</Text>}

            <Card style={{ marginTop: 16 }}>
              <Line label="Minimum" value={`${o.minAmount} ${o.asset}`} />
              <Line label="Network fee" value={`${o.fee} ${o.asset}`} />
              <Line
                label="You receive"
                value={v?.ok ? `${displayUnits(v.receive, selected.decimals)} ${o.asset}` : '—'}
                strong
              />
            </Card>

            <Text style={[s.label, { marginBottom: 8 }]}>Destination</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {o.destinations.map((d) => (
                <Chip key={d.id} label={d.label} active={d.id === dest?.id} onPress={() => setDestinationId(d.id)} />
              ))}
              {o.destinations.length === 0 && <Text style={{ color: colors.danger }}>No destinations available.</Text>}
            </View>

            <Button title="Review claim" disabled={!v?.ok || !dest} onPress={() => setConfirming(true)} />
          </>
        )}
      </ScrollView>

      {/* Alert.alert does not work on web; use an in-app modal. */}
      <Modal visible={confirming && !!v?.ok} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }}>
          <View style={[s.card, { maxWidth: 440, width: '100%', alignSelf: 'center' }]}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Confirm claim</Text>
            {v?.ok && o && (
              <>
                <Line label="Amount" value={`${formatUnits(v.amount, selected.decimals)} ${o.asset}`} />
                <Line label="Fee" value={`${formatUnits(v.fee, selected.decimals)} ${o.asset}`} />
                <Line label="You receive" value={`${formatUnits(v.receive, selected.decimals)} ${o.asset}`} strong />
                <Line label="To" value={dest?.label ?? ''} />
              </>
            )}
            <View style={{ gap: 8, marginTop: 16 }}>
              <Button title="Confirm" onPress={confirm} />
              <Button title="Cancel" variant="secondary" onPress={() => setConfirming(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary : '#fff',
      }}
    >
      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
