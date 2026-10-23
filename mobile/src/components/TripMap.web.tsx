import { Linking, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { c, f, Icon } from '../ui';
import type { MapPoint } from './mapTypes';

/** Web preview fallback: react-native-maps only runs on iOS and Android. */
export default function TripMap({ vehicle, school, label }: MapPoint) {
  const p = vehicle ?? school;
  const url = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=15/${p.lat}/${p.lon}`;
  return (
    <View style={{ height: 200, backgroundColor: '#EEF1EC', justifyContent: 'flex-end', padding: 14 }}>
      <Svg width="100%" height="100%" viewBox="0 0 340 200" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 } as never}>
        <Path d="M-10 150 C60 140 90 70 170 80 S280 40 360 30" stroke="#fff" strokeWidth={18} fill="none" />
        <Path d="M40 -10 L90 210 M230 -10 L250 210" stroke="#fff" strokeWidth={10} fill="none" />
        <Path d="M60 140 C100 120 120 90 170 80 S250 60 290 48" stroke={c.teal} strokeWidth={4} strokeDasharray="7 7" fill="none" />
        <Circle cx={60} cy={140} r={8} fill={c.navy} />
        <Circle cx={290} cy={48} r={8} fill={c.gold} />
        {vehicle && <Circle cx={170} cy={80} r={11} fill={c.teal} stroke="#fff" strokeWidth={3} />}
      </Svg>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Text style={{ fontFamily: f.medium, fontSize: 13, color: c.ink }}>{vehicle ? `${label} is on its way` : 'Waiting for first location'}</Text>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.navy }}>Open map</Text>
          <Icon name="chevron" size={16} color={c.navy} />
        </Pressable>
      </View>
    </View>
  );
}
