import { Linking, Pressable, Text, View } from 'react-native';

import { c } from '../ui';
import type { MapPoint } from './mapTypes';

/** Web preview fallback: react-native-maps only runs on iOS and Android. */
export default function TripMap({ vehicle, school, label }: MapPoint) {
  const p = vehicle ?? school;
  const url = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=15/${p.lat}/${p.lon}`;
  return (
    <View style={{ height: 120, borderRadius: 12, backgroundColor: '#EAF0E8', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Text style={{ color: c.ink, fontWeight: '600' }}>{vehicle ? `${label} at ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` : 'Waiting for first location'}</Text>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)}>
        <Text style={{ color: c.green, fontWeight: '700' }}>Open map</Text>
      </Pressable>
    </View>
  );
}
