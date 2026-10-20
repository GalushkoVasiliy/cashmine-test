import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useToken } from '../lib/token';
import { Button, Card, colors, s, Screen } from './ui';

export function TokenScreen() {
  const { setToken, reason } = useToken();
  const [value, setValue] = useState('');
  const trimmed = value.trim();

  return (
    <Screen>
      <View style={{ padding: 16, paddingTop: 48 }}>
        <Text style={[s.h1, { marginBottom: 8 }]}>CashMine</Text>
        <Text style={{ color: colors.muted, marginBottom: 24 }}>
          Enter your API token. It is kept only in this browser&apos;s local storage.
        </Text>
        {reason && (
          <Card style={{ borderColor: colors.danger }}>
            <Text style={{ color: colors.danger }}>{reason}</Text>
          </Card>
        )}
        <TextInput
          style={[s.input, { marginBottom: 16 }]}
          placeholder="API token"
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          onSubmitEditing={() => trimmed && setToken(trimmed)}
        />
        <Button title="Continue" disabled={!trimmed} onPress={() => setToken(trimmed)} />
      </View>
    </Screen>
  );
}
