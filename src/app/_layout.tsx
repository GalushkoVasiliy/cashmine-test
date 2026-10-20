import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { TokenScreen } from '../components/TokenScreen';
import { TokenProvider, useToken } from '../lib/token';

function Gate() {
  const { token } = useToken();
  if (!token) return <TokenScreen />;
  return (
    <Stack screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Screen name="index" options={{ title: 'Payback' }} />
      <Stack.Screen name="claim" options={{ title: 'Claim' }} />
      <Stack.Screen name="claims/[id]" options={{ title: 'Claim status' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [qc] = useState(
    () =>
      new QueryClient({
        // Retries/backoff live in the API client (it knows about 429 and error kinds).
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <TokenProvider>
        <Gate />
      </TokenProvider>
    </QueryClientProvider>
  );
}
