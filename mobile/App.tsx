import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { api, loadToken, saveToken, type User } from './src/api';
import CrewApp from './src/screens/crew/CrewApp';
import Login from './src/screens/Login';
import ParentApp from './src/screens/parent/ParentApp';
import { c } from './src/ui';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (await loadToken()) {
        try { setUser(await api<User>('/auth/me')); } catch { await saveToken(null); }
      }
      setReady(true);
    })();
  }, []);

  const signOut = async () => { await saveToken(null); setUser(null); };
  const dark = user?.role === 'crew';

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: dark ? c.night : c.ground }}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        {!ready ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.green} /></View>
        ) : !user ? (
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
