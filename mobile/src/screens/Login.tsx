import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ApiError, post, saveToken, type User } from '../api';
import { Button, c, ErrorText, f, Field, Muted, Notice, s, Wordmark } from '../ui';

type Step = 'phone' | 'code' | 'password';

export default function Login({ onIn }: { onIn: (u: User) => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Sign-in failed. Try again.'); } finally { setBusy(false); }
  }

  async function finish(r: { access_token: string; user: User }) {
    if (r.user.role !== 'parent' && r.user.role !== 'crew') {
      setError('School staff and the ops centre sign in on the web dashboard.');
      return;
    }
    await saveToken(r.access_token);
    onIn(r.user);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.navy900 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        {/* Brand panel: the logo's route, drawn large and quiet behind the promise. */}
        <View style={{ paddingHorizontal: 28, paddingTop: 28, paddingBottom: 44, overflow: 'hidden', minHeight: 300, justifyContent: 'space-between' }}>
          <Svg width={360} height={360} viewBox="0 0 120 120" style={{ position: 'absolute', right: -130, top: -30, opacity: 0.09 }}>
            <Path d="M94,30 C86,21 76,18 62,18 C36,18 20,33 20,58 L20,64 C20,89 36,102 60,102 C84,102 100,90 100,68 L100,62 L78,62"
              fill="none" stroke="#fff" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Wordmark size={24} reversed />
          <View style={{ gap: 12, marginTop: 56 }}>
            <Text style={{ fontFamily: f.display, fontSize: 38, lineHeight: 40, letterSpacing: -1.2, color: '#fff' }}>
              Little journeys.{'\n'}Big peace of mind.
            </Text>
            <Text style={{ fontFamily: f.body, fontSize: 16, lineHeight: 23, color: c.nightMuted, maxWidth: 320 }}>
              Child-only rides home from school, with a vetted driver and escort on every trip.
            </Text>
          </View>
        </View>

        <View style={{
          flex: 1, backgroundColor: c.ground, borderTopLeftRadius: 32, borderTopRightRadius: 32,
          padding: 24, paddingTop: 30, paddingBottom: 24 + insets.bottom, gap: 18,
        }}>
          <View style={{ gap: 4 }}>
            <Text style={{ fontFamily: f.display, fontSize: 24, color: c.ink, letterSpacing: -0.5 }}>
              {step === 'code' ? 'Enter your code' : 'Sign in'}
            </Text>
            <Muted>{step === 'code' ? `We sent a 6-digit code to ${phone}.` : 'Use the phone number your school registered.'}</Muted>
          </View>

          {step !== 'code' && (
            <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad"
              autoComplete="tel" placeholder="0803 000 0000" />
          )}
          {step === 'code' && (
            <Field label="Code from SMS" value={code} onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" autoFocus
              style={{ fontFamily: f.display, fontSize: 26, letterSpacing: 10, textAlign: 'center' }} placeholder="••••••" />
          )}
          {step === 'password' && (
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          )}

          <ErrorText>{error}</ErrorText>

          {step === 'phone' && (
            <Button label="Send me a code" kind="gold" size="lg" busy={busy} disabled={phone.length < 10}
              onPress={() => run(async () => { await post('/auth/otp/request', { phone }); setStep('code'); })} />
          )}
          {step === 'code' && (
            <>
              <Button label="Sign in" kind="gold" size="lg" busy={busy} disabled={code.length !== 6}
                onPress={() => run(async () => finish(await post('/auth/otp/verify', { phone, code })))} />
              <Notice kind="info" icon="phone">If this number is registered, the code arrives within a minute.</Notice>
              <Button label="Change number or resend" kind="quiet" onPress={() => { setStep('phone'); setCode(''); }} />
            </>
          )}
          {step === 'password' && (
            <Button label="Sign in" kind="gold" size="lg" busy={busy} disabled={!password}
              onPress={() => run(async () => finish(await post('/auth/login', { phone, password })))} />
          )}
          {step !== 'code' && (
            <Pressable onPress={() => { setStep(step === 'password' ? 'phone' : 'password'); setError(''); }} accessibilityRole="button"
              style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={{ fontFamily: f.semi, color: c.navy, fontSize: 15 }}>
                {step === 'password' ? 'Use an SMS code instead' : 'Use a password instead'}
              </Text>
            </Pressable>
          )}

          <View style={{ flex: 1 }} />
          <View style={[s.row, { justifyContent: 'center', gap: 6 }]}>
            <Muted style={{ fontSize: 12, textAlign: 'center' }}>Test accounts: parent 08030000100, driver 08030000010, password littlego123</Muted>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
