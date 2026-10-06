import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { ChildStatus } from './api';

export const c = {
  ground: '#F4F5F0', card: '#FFFFFF', ink: '#13232B', muted: '#55636B', line: '#DDE2DC',
  green: '#0B6E4F', greenSoft: '#E3F1EA', greenInk: '#0A4F39', amberSoft: '#FDF1E2', amberInk: '#6B3A05',
  red: '#B42318', redSoft: '#FDE8E6', night: '#13232B', nightCard: '#1B2E36', nightLine: '#27414B',
  nightMuted: '#A9B8BF',
};

export function Card({ children, style, dark }: { children: ReactNode; style?: ViewStyle; dark?: boolean }) {
  return <View style={[s.card, dark && s.cardDark, style]}>{children}</View>;
}

type BtnKind = 'primary' | 'outline' | 'danger' | 'ghost';
export function Button({ label, onPress, kind = 'primary', busy, disabled, style }: {
  label: string; onPress: () => void; kind?: BtnKind; busy?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.btn, s[kind], off && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}
    >
      {busy ? <ActivityIndicator color={kind === 'outline' ? c.green : '#fff'} />
        : <Text style={[s.btnText, (kind === 'outline' || kind === 'ghost') && { color: kind === 'ghost' ? '#fff' : c.green }]}>{label}</Text>}
    </Pressable>
  );
}

const PILL: Record<ChildStatus, { label: string; bg: string; fg: string }> = {
  scheduled: { label: 'In school', bg: '#EEF0EC', fg: '#3C4A52' },
  released: { label: 'Released', bg: c.greenSoft, fg: c.greenInk },
  on_board: { label: 'On board', bg: c.greenSoft, fg: c.greenInk },
  handed_over: { label: 'Home', bg: '#DCE7F7', fg: '#1E3A68' },
  at_safe_hub: { label: 'At safe hub', bg: c.amberSoft, fg: c.amberInk },
  absent: { label: 'Absent', bg: '#EEF0EC', fg: '#3C4A52' },
};

export function StatusPill({ status }: { status: ChildStatus }) {
  const p = PILL[status];
  return <Text style={[s.pill, { backgroundColor: p.bg, color: p.fg }]}>{p.label}</Text>;
}

export function H1({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[s.h1, light && { color: '#fff' }]} accessibilityRole="header">{children}</Text>;
}

export function Muted({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[s.muted, light && { color: c.nightMuted }]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <Text style={s.error} accessibilityRole="alert">{children}</Text> : null;
}

export const s = StyleSheet.create({
  card: { backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  cardDark: { backgroundColor: c.nightCard, borderColor: c.nightLine },
  btn: { minHeight: 48, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: c.green },
  outline: { backgroundColor: '#fff', borderWidth: 1, borderColor: c.green },
  danger: { backgroundColor: c.red },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.nightMuted },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  pill: { fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  h1: { fontSize: 24, fontWeight: '700', color: c.ink },
  muted: { fontSize: 13, color: c.muted },
  error: { color: c.red, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { justifyContent: 'space-between' },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: 16, backgroundColor: '#fff', color: c.ink },
  label: { fontSize: 14, fontWeight: '600', color: c.ink },
});
