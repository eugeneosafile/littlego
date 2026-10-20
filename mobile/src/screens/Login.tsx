import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { ApiError, post, saveToken, type User } from '../api';
import { Button, c, ErrorText, Muted, s } from '../ui';

type Step = 'phone' | 'code' | 'password';

export default function Login({ onIn }: { onIn: (u: User) => void }) {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Sign-in failed'); } finally { setBusy(false); }
  }

  async function finish(r: { access_token: string; user: User }) {
    if (r.user.role !== 'parent' && r.user.role !== 'crew') {
      setError('School staff and the ops centre use the web dashboard.');
      return;
    }
    await saveToken(r.access_token);
    onIn(r.user);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: c.ground }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 32, fontWeight: '800', color: c.green }}>LittleGo</Text>
        <Muted>Safe, child-only rides home from school.</Muted>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={s.label}>Phone number</Text>
        <TextInput style={s.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={step !== 'code'}
          autoComplete="tel" accessibilityLabel="Phone number" placeholder="0803 000 0000" />
      </View>

      {step === 'code' && (
        <View style={{ gap: 6 }}>
          <Text style={s.label}>6-digit code from SMS</Text>
          <TextInput style={s.input} value={code} onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" accessibilityLabel="SMS code" />
        </View>
      )}
      {step === 'password' && (
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Password</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry
            autoComplete="password" accessibilityLabel="Password" />
        </View>
      )}

      <ErrorText>{error}</ErrorText>

      {step === 'phone' && (
        <Button label="Send me a code" busy={busy} disabled={phone.length < 10}
          onPress={() => run(async () => { await post('/auth/otp/request', { phone }); setStep('code'); })} />
      )}
      {step === 'code' && (
        <>
          <Muted>If this number is registered, a code is on its way by SMS.</Muted>
          <Button label="Sign in" busy={busy} disabled={code.length !== 6}
            onPress={() => run(async () => finish(await post('/auth/otp/verify', { phone, code })))} />
          <Pressable onPress={() => { setStep('phone'); setCode(''); }} accessibilityRole="button">
            <Text style={{ color: c.green, fontWeight: '600', textAlign: 'center' }}>Change number or resend</Text>
          </Pressable>
        </>
      )}
      {step === 'password' && (
        <Button label="Sign in" busy={busy} disabled={!password}
          onPress={() => run(async () => finish(await post('/auth/login', { phone, password })))} />
      )}
      {step !== 'code' && (
        <Pressable onPress={() => setStep(step === 'password' ? 'phone' : 'password')} accessibilityRole="button">
          <Text style={{ color: c.muted, textAlign: 'center' }}>
            {step === 'password' ? 'Use an SMS code instead' : 'Use a password (demo accounts)'}
          </Text>
        </Pressable>
      )}
      <Muted>Demo: parent 08030000100, driver 08030000010 · password littlego123</Muted>
    </KeyboardAvoidingView>
  );
}
