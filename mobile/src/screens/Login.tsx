import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';

import { ApiError, post, saveToken, type User } from '../api';
import { Button, c, ErrorText, Muted, s } from '../ui';

export default function Login({ onIn }: { onIn: (u: User) => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const r = await post<{ access_token: string; user: User }>('/auth/login', { phone, password });
      if (r.user.role !== 'parent' && r.user.role !== 'crew') {
        setError('School staff and the ops centre use the web dashboard.');
        return;
      }
      await saveToken(r.access_token);
      onIn(r.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: c.ground }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 32, fontWeight: '800', color: c.green }}>WardRide</Text>
        <Muted>Safe, child-only rides home from school.</Muted>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={s.label}>Phone number</Text>
        <TextInput style={s.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad"
          autoComplete="tel" accessibilityLabel="Phone number" placeholder="0803 000 0000" />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={s.label}>Password</Text>
        <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry
          autoComplete="password" accessibilityLabel="Password" />
      </View>
      <ErrorText>{error}</ErrorText>
      <Button label="Sign in" onPress={submit} busy={busy} disabled={!phone || !password} />
      <Muted>Demo: parent 08030000100, driver 08030000010, escort 08030000011 · password wardride123</Muted>
    </KeyboardAvoidingView>
  );
}
