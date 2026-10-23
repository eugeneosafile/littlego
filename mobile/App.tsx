import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { api, loadToken, saveToken, type User } from './src/api';
import CrewApp from './src/screens/crew/CrewApp';
import Login from './src/screens/Login';
import ParentApp from './src/screens/parent/ParentApp';
import { c } from './src/ui';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular, Geist_500Medium, Geist_600SemiBold,
    BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    (async () => {
      if (await loadToken()) {
        try { setUser(await api<User>('/auth/me')); } catch { await saveToken(null); }
      }
      setReady(true);
    })();
  }, []);

  // Keep the navy splash up until the session and brand fonts are ready (system fonts if they fail).
  const loaded = ready && (fontsLoaded || !!fontError);
  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => {}); }, [loaded]);

  const signOut = async () => { await saveToken(null); setUser(null); };
  const dark = !user || user.role === 'crew';

  if (!loaded) return <View style={{ flex: 1, backgroundColor: c.navy900 }} />;

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'left', 'right']}
        style={{ flex: 1, backgroundColor: !user ? c.navy900 : dark ? c.night : c.ground }}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        {!user ? (
          <Login onIn={setUser} />
        ) : user.role === 'crew' ? (
          <CrewApp user={user} onSignOut={signOut} />
        ) : (
          <ParentApp user={user} onSignOut={signOut} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
