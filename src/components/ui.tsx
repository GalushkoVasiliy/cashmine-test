import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

export const colors = {
  bg: '#f5f6f8',
  card: '#ffffff',
  text: '#111418',
  muted: '#667085',
  border: '#e4e7ec',
  primary: '#1849a9',
  danger: '#b42318',
  warn: '#b54708',
  ok: '#067647',
};

export function Screen({ children }: { children: ReactNode }) {
  return <View style={s.screen}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={off ? undefined : onPress}
      style={[s.btn, variant === 'secondary' && s.btnSecondary, off && s.btnOff]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.primary} />
      ) : (
        <Text style={[s.btnText, variant === 'secondary' && s.btnTextSecondary]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: colors.danger }}>
      <Text style={{ color: colors.danger, marginBottom: onRetry ? 12 : 0 }}>{message}</Text>
      {onRetry && <Button title="Retry" variant="secondary" onPress={onRetry} />}
    </Card>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, width: '100%', maxWidth: 480, alignSelf: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  btnOff: { opacity: 0.45 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  btnTextSecondary: { color: colors.primary },
  h1: { fontSize: 28, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, color: colors.muted },
  value: { fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.text,
  },
});
