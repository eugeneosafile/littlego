import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { MapPoint } from './mapTypes';

// Android release builds need a Google Maps API key in app.json (android.config.googleMaps.apiKey).
// Expo Go works without one for testing.
export default function TripMap({ vehicle, school, home, label }: MapPoint) {
  const focus = vehicle ?? school;
  return (
    <View style={styles.wrap}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: focus.lat, longitude: focus.lon, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        accessibilityLabel="Map of the vehicle, school and home"
      >
        <Marker coordinate={{ latitude: school.lat, longitude: school.lon }} title="School" pinColor="#0F2D5B" />
        {home && <Marker coordinate={{ latitude: home.lat, longitude: home.lon }} title="Home" pinColor="#F4B400" />}
        {vehicle && <Marker coordinate={{ latitude: vehicle.lat, longitude: vehicle.lon }} title={label} pinColor="#008F7A" />}
        {home && (
          <Polyline coordinates={[{ latitude: school.lat, longitude: school.lon }, { latitude: home.lat, longitude: home.lon }]}
            strokeColor="#008F7A" strokeWidth={3} lineDashPattern={[6, 6]} />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { height: 240, overflow: 'hidden' } });
