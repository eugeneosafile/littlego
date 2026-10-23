import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { ChildStatus } from './api';

// ---------------------------------------------------------------------------
// Tokens — matched to littlego.ng (deep navy, brand teal, gold for action and
// arrival, warm sand ground).
// ---------------------------------------------------------------------------
export const c = {
  navy950: '#06152C', navy900: '#0A1F3F', navy: '#0F2D5B', navy600: '#24467F', navy100: '#E7ECF4',
  teal: '#008F7A', tealInk: '#00705F', teal300: '#2EC4AE', tealSoft: '#E3F4F0',
  gold: '#F4B400', gold300: '#FFCB3D', goldSoft: '#FFF5D6', goldInk: '#6B4A00',
  ground: '#F9F7F2', sand2: '#F2EEE5', card: '#FFFFFF', line: '#E4DFD3', lineSoft: '#EEEAE0',
  ink: '#142238', muted: '#56627A', faint: '#8A93A5',
  red: '#B42318', redSoft: '#FEF3F2', amberSoft: '#FDF1E2', amberInk: '#7A4100',
  // night (crew) surfaces
  night: '#06152C', nightCard: '#0E2346', nightLine: '#1D3560', nightMuted: '#A3B2CC',
};

export const f = {
  body: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semi: 'Geist_600SemiBold',
  display: 'BricolageGrotesque_600SemiBold',
  displayBold: 'BricolageGrotesque_700Bold',
  logo: 'PlusJakartaSans_800ExtraBold',
};

export const shadow = {
  soft: { boxShadow: '0px 10px 28px -16px rgba(10,31,63,0.28)' } as ViewStyle,
  lift: { boxShadow: '0px 24px 48px -24px rgba(6,21,44,0.55)' } as ViewStyle,
};

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------
export function LogoMark({ size = 32, reversed }: { size?: number; reversed?: boolean }) {
  const stroke = reversed ? '#FFFFFF' : c.navy;
  const teal = reversed ? c.teal300 : c.teal;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="LittleGo">
      <Path d="M94,30 C86,21 76,18 62,18 C36,18 20,33 20,58 L20,64 C20,89 36,102 60,102" fill="none"
        stroke={stroke} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M60,102 C84,102 100,90 100,68 L100,62 L78,62" fill="none" stroke={teal} strokeWidth={18} strokeLinejoin="round" />
      <Circle cx={78} cy={62} r={9} fill={teal} />
      <Circle cx={57} cy={62} r={9} fill={c.gold} />
    </Svg>
  );
}

export function Wordmark({ size = 22, reversed }: { size?: number; reversed?: boolean }) {
  return (
    <View style={[s.row, { gap: size * 0.4 }]} accessibilityRole="header" accessibilityLabel="LittleGo">
      <LogoMark size={size * 1.35} reversed={reversed} />
      <Text style={{ fontFamily: f.logo, fontSize: size, letterSpacing: -0.6, color: reversed ? '#fff' : c.navy }}>
        Little<Text style={{ color: reversed ? c.teal300 : c.teal }}>Go</Text>
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Icons — 24px line icons, 1.8 stroke, drawn to match the website set.
// ---------------------------------------------------------------------------
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9',
  live: 'M15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8M8.5 15.5a5 5 0 0 1 0-7M5.6 18.4a9 9 0 0 1 0-12.8M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  ticket: 'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM14 6v12',
  key: 'M8 15a5 5 0 1 1 3.9-1.9L20 21M16.5 17.5l2-2M14 15l1.5-1.5M7.5 10h.01',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  car: 'M5 16h14M5 16v3M19 16v3M5 16l1.6-5.2A2 2 0 0 1 8.5 9.5h7a2 2 0 0 1 1.9 1.3L19 16M8 13h.01M16 13h.01M3 16h18v-2l-2-1',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5',
  bus: 'M5 17V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v11M5 17h14M5 17v3M19 17v3M5 11h14M8 14h.01M16 14h.01',
  pin: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  camera: 'M15 10l5-3v10l-5-3M3 7h12v10H3z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  chevron: 'M9 6l6 6-6 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  play: 'M8 5.5v13l11-6.5z',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  hub: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6',
  data: 'M4 20h2v-4H4zM9 20h2v-8H9zM14 20h2V8h-2zM19 20h2V4h-2z',
  sos: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16h.01',
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color = c.ink, stroke = 1.8 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={ICONS[name]} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------
export function H1({ children, light, style }: { children: ReactNode; light?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h1, light && { color: '#fff' }, style]} accessibilityRole="header">{children}</Text>;
}
export function Title({ children, light, style }: { children: ReactNode; light?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.title, light && { color: '#fff' }, style]}>{children}</Text>;
}
export function Body({ children, light, style }: { children: ReactNode; light?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.body, light && { color: '#fff' }, style]}>{children}</Text>;
}
export function Muted({ children, light, style }: { children: ReactNode; light?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.muted, light && { color: c.nightMuted }, style]}>{children}</Text>;
}
export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <View style={[s.notice, { backgroundColor: c.redSoft }]} accessibilityRole="alert">
      <Icon name="alert" size={18} color={c.red} />
      <Text style={[s.noticeText, { color: c.red }]}>{children}</Text>
    </View>
  );
}

type NoticeKind = 'info' | 'ok' | 'warn';
const NOTICE: Record<NoticeKind, { bg: string; fg: string; icon: IconName }> = {
  info: { bg: c.navy100, fg: c.navy, icon: 'shield' },
  ok: { bg: c.tealSoft, fg: c.tealInk, icon: 'check' },
  warn: { bg: c.amberSoft, fg: c.amberInk, icon: 'hub' },
};
export function Notice({ kind = 'info', children, icon }: { kind?: NoticeKind; children: ReactNode; icon?: IconName }) {
  const n = NOTICE[kind];
  return (
    <View style={[s.notice, { backgroundColor: n.bg }]}>
      <Icon name={icon ?? n.icon} size={18} color={n.fg} />
      <Text style={[s.noticeText, { color: n.fg }]}>{children}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export function Card({ children, style, dark, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; dark?: boolean; tone?: 'navy' | 'sand' }) {
  return (
    <View style={[s.card, dark && s.cardDark, tone === 'navy' && s.cardNavy, tone === 'sand' && s.cardSand, style]}>{children}</View>
  );
}

export function SectionLabel({ children, light, right }: { children: ReactNode; light?: boolean; right?: ReactNode }) {
  return (
    <View style={[s.row, s.between, { marginTop: 8 }]}>
      <Text style={[s.section, light && { color: '#fff' }]}>{children}</Text>
      {right}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type BtnKind = 'primary' | 'gold' | 'outline' | 'danger' | 'ghost' | 'quiet';
const BTN_FG: Record<BtnKind, string> = {
  primary: '#fff', gold: c.navy950, outline: c.navy, danger: '#fff', ghost: '#fff', quiet: c.navy,
};
export function Button({ label, onPress, kind = 'primary', busy, disabled, style, icon, size = 'md', accessibilityLabel }: {
  label: string; onPress: () => void; kind?: BtnKind; busy?: boolean; disabled?: boolean;
  style?: StyleProp<ViewStyle>; icon?: IconName; size?: 'sm' | 'md' | 'lg'; accessibilityLabel?: string;
}) {
  const off = disabled || busy;
  const fg = BTN_FG[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.btn, s[`btn_${kind}`], size === 'sm' && s.btnSm, size === 'lg' && s.btnLg,
        off && { opacity: 0.45 }, pressed && !off && { transform: [{ scale: 0.98 }], opacity: 0.92 }, style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Icon name={icon} size={size === 'sm' ? 16 : 19} color={fg} stroke={2} />}
          <Text style={[s.btnText, size === 'sm' && { fontSize: 14 }, size === 'lg' && { fontSize: 17 }, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, light }: { icon: IconName; onPress: () => void; label: string; light?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => [s.iconBtn, light && s.iconBtnLight, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={20} color={light ? '#fff' : c.navy} />
    </Pressable>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, light }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; light?: boolean;
}) {
  return (
    <View style={[s.segmented, light && { backgroundColor: c.nightCard }]} accessibilityRole="tablist">
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[s.segment, on && (light ? { backgroundColor: c.nightLine } : s.segmentOn)]}>
            <Text style={[s.segmentText, on && { color: light ? '#fff' : c.navy }, light && !on && { color: c.nightMuted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export function Field({ label, dark, style, ...props }: TextInputProps & { label?: string; dark?: boolean }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      {label && <Text style={[s.label, dark && { color: c.nightMuted }]}>{label}</Text>}
      <TextInput
        placeholderTextColor={dark ? c.nightMuted : c.faint}
        {...props}
        onFocus={e => { setFocus(true); props.onFocus?.(e); }}
        onBlur={e => { setFocus(false); props.onBlur?.(e); }}
        accessibilityLabel={props.accessibilityLabel ?? label}
        style={[s.input, dark && s.inputDark, focus && (dark ? { borderColor: c.gold } : s.inputFocus), style]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
export const STATUS: Record<ChildStatus, { label: string; bg: string; fg: string; dot: string }> = {
  scheduled: { label: 'In school', bg: c.sand2, fg: c.muted, dot: c.faint },
  released: { label: 'With escort', bg: c.tealSoft, fg: c.tealInk, dot: c.teal },
  on_board: { label: 'On the way', bg: c.tealSoft, fg: c.tealInk, dot: c.teal },
  handed_over: { label: 'Home safe', bg: c.goldSoft, fg: c.goldInk, dot: c.gold },
  at_safe_hub: { label: 'At safe hub', bg: c.amberSoft, fg: c.amberInk, dot: '#D97706' },
  absent: { label: 'Absent', bg: c.sand2, fg: c.muted, dot: c.faint },
};

export function StatusPill({ status, onDark }: { status: ChildStatus; onDark?: boolean }) {
  const p = STATUS[status];
  return (
    <View style={[s.pill, { backgroundColor: onDark ? 'rgba(255,255,255,0.1)' : p.bg }]}>
      <View style={[s.pillDot, { backgroundColor: p.dot }]} />
      <Text style={[s.pillText, { color: onDark ? '#fff' : p.fg }]}>{p.label}</Text>
    </View>
  );
}

/**
 * The child's journey drawn as the logo's route: school → gate → on the way → home.
 * The gold dot marks where the child is now (gold = arrival, as on the website).
 */
const STAGES = ['School', 'Gate', 'On the way', 'Home'];
const STAGE_OF: Record<ChildStatus, number> = { scheduled: 0, released: 1, on_board: 2, handed_over: 3, at_safe_hub: 2, absent: -1 };

const LABEL_POS: TextStyle[] = [
  { position: 'absolute', left: 0, textAlign: 'left' },
  { position: 'absolute', left: '16.66%', width: '33.33%', textAlign: 'center' },
  { position: 'absolute', left: '50%', width: '33.33%', textAlign: 'center' },
  { position: 'absolute', right: 0, textAlign: 'right' },
];

export function JourneyTrack({ status, light }: { status: ChildStatus; light?: boolean }) {
  const at = STAGE_OF[status];
  const done = light ? c.teal300 : c.teal;
  const rest = light ? 'rgba(255,255,255,0.18)' : c.line;
  return (
    <View accessibilityLabel={`Journey: ${STATUS[status].label}`} accessible>
      <View style={[s.row, { gap: 0, alignItems: 'center' }]}>
        {STAGES.map((_, i) => (
          <View key={i} style={[s.row, { gap: 0, flex: i === 0 ? 0 : 1 }]}>
            {i > 0 && <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= at ? done : rest }} />}
            {i === at ? (
              <View style={s.trackNow}>
                <Svg width={22} height={22}><Circle cx={11} cy={11} r={11} fill={c.gold} opacity={0.25} /><Circle cx={11} cy={11} r={7} fill={c.gold} /></Svg>
              </View>
            ) : (
              <View style={[s.trackDot, { backgroundColor: i < at ? done : light ? c.navy900 : c.card, borderColor: i < at ? done : rest }]} />
            )}
          </View>
        ))}
      </View>
      {/* Labels sit under their dots: ends aligned to the edges, middle two centred on 1/3 and 2/3. */}
      <View style={{ height: 18, marginTop: 8 }}>
        {STAGES.map((label, i) => (
          <Text key={label} numberOfLines={1} style={[s.trackLabel, LABEL_POS[i],
            light && { color: i === at ? '#fff' : c.nightMuted }, !light && i === at && { color: c.ink, fontFamily: f.semi }]}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function Avatar({ name, size = 40, tone = 'navy' }: { name: string; size?: number; tone?: 'navy' | 'teal' | 'sand' }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
  const bg = tone === 'navy' ? c.navy : tone === 'teal' ? c.tealSoft : c.sand2;
  const fg = tone === 'navy' ? '#fff' : tone === 'teal' ? c.tealInk : c.navy;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: f.semi, fontSize: size * 0.36, color: fg }}>{initials}</Text>
    </View>
  );
}

export function Divider({ light }: { light?: boolean }) {
  return <View style={{ height: 1, backgroundColor: light ? c.nightLine : c.lineSoft }} />;
}

export function QrFrame({ size = 240 }: { size?: number }) {
  const l = 34;
  const r = 22;
  const d = `M2 ${l}V${r}A${r - 2} ${r - 2} 0 0 1 ${r} 2H${l} M${size - l} 2H${size - r}A${r - 2} ${r - 2} 0 0 1 ${size - 2} ${r}V${l} M${size - 2} ${size - l}V${size - r}A${r - 2} ${r - 2} 0 0 1 ${size - r} ${size - 2}H${size - l} M${l} ${size - 2}H${r}A${r - 2} ${r - 2} 0 0 1 2 ${size - r}V${size - l}`;
  return (
    <Svg width={size} height={size}>
      <Rect x={0} y={0} width={size} height={size} fill="none" />
      <Path d={d} stroke={c.gold} strokeWidth={5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
export const s = StyleSheet.create({
  // layout
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { justifyContent: 'space-between' },
  // type
  h1: { fontFamily: f.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.8, color: c.ink },
  title: { fontFamily: f.display, fontSize: 19, lineHeight: 24, letterSpacing: -0.3, color: c.ink },
  body: { fontFamily: f.body, fontSize: 15, lineHeight: 22, color: c.ink },
  muted: { fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.muted },
  label: { fontFamily: f.medium, fontSize: 14, color: c.ink },
  section: { fontFamily: f.semi, fontSize: 15, color: c.ink, letterSpacing: -0.1 },
  // surfaces
  card: { backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 22, padding: 18, gap: 12, ...shadow.soft },
  cardDark: { backgroundColor: c.nightCard, borderColor: c.nightLine, boxShadow: 'none' },
  cardNavy: { backgroundColor: c.navy, borderColor: c.navy, ...shadow.lift },
  cardSand: { backgroundColor: c.sand2, borderColor: c.sand2, boxShadow: 'none' },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  noticeText: { flex: 1, fontFamily: f.medium, fontSize: 14, lineHeight: 20 },
  // buttons
  btn: { minHeight: 52, borderRadius: 999, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnSm: { minHeight: 40, paddingHorizontal: 16 },
  btnLg: { minHeight: 60, paddingHorizontal: 26 },
  btn_primary: { backgroundColor: c.navy, boxShadow: '0px 12px 24px -14px rgba(15,45,91,0.9)' },
  btn_gold: { backgroundColor: c.gold, boxShadow: '0px 12px 26px -12px rgba(244,180,0,0.7)' },
  btn_outline: { backgroundColor: c.card, borderWidth: 1, borderColor: c.line },
  btn_danger: { backgroundColor: c.red },
  btn_ghost: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  btn_quiet: { backgroundColor: 'transparent', paddingHorizontal: 8 },
  btnText: { fontFamily: f.semi, fontSize: 16, letterSpacing: -0.1 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card, borderWidth: 1, borderColor: c.line },
  iconBtnLight: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.16)' },
  segmented: { flexDirection: 'row', backgroundColor: c.sand2, borderRadius: 999, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  segmentOn: { backgroundColor: c.card, boxShadow: '0px 2px 6px rgba(10,31,63,0.12)' },
  segmentText: { fontFamily: f.semi, fontSize: 14, color: c.muted },
  // inputs
  input: {
    borderWidth: 1.5, borderColor: c.line, borderRadius: 16, paddingHorizontal: 16, minHeight: 54,
    fontSize: 16, fontFamily: f.body, backgroundColor: c.card, color: c.ink,
  },
  inputFocus: { borderColor: c.navy },
  inputDark: { backgroundColor: c.nightCard, borderColor: c.nightLine, color: '#fff' },
  // status
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, alignSelf: 'flex-start' },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontFamily: f.semi, fontSize: 13 },
  trackDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  trackNow: { width: 22, height: 22, marginHorizontal: -4 },
  trackLabel: { fontFamily: f.medium, fontSize: 12, color: c.muted },
});
