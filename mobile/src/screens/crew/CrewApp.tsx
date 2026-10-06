import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { api, ApiError, post, type CrewTrip, type Receiver, type TripChild, type User } from '../../api';
import { Button, c, Card, ErrorText, H1, Muted, s, StatusPill } from '../../ui';

const PING_EVERY_MS = 30_000;

export default function CrewApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [trip, setTrip] = useState<CrewTrip | null>(null);
  const [card, setCard] = useState('');
  const [open, setOpen] = useState<number | null>(null); // trip_child_id being handed over
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const trips = await api<CrewTrip[]>('/crew/trips/today');
      setTrip(trips.find(t => t.status !== 'completed') ?? trips[0] ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load trip');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  useLocationPings(trip?.status === 'in_progress' ? trip.id : null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try { await fn(); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  }

  if (!trip) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12, justifyContent: 'center', backgroundColor: c.night }}>
        <H1 light>No trip assigned today</H1>
        <ErrorText>{error}</ErrorText>
        <Button label="Sign out" kind="ghost" onPress={onSignOut} />
      </View>
    );
  }

  const onBoard = trip.children.filter(x => x.status === 'on_board').length;
  const done = trip.children.filter(x => x.status === 'handed_over' || x.status === 'at_safe_hub').length;

  function sos() {
    Alert.alert('Send SOS?', 'The ops centre will be alerted and will call you immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send SOS', style: 'destructive', onPress: () => run(() => post(`/crew/trips/${trip!.id}/sos`, { note: '' })) },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.night }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 32 }}>
        <View style={[s.row, s.between]}>
          <View style={{ flex: 1 }}>
            <Muted light>{user.crew_role === 'driver' ? 'Driver' : 'Escort'} · {user.name}</Muted>
            <H1 light>{trip.vehicle.code} · {trip.status.replace('_', ' ')}</H1>
          </View>
          <Button label="Sign out" kind="ghost" onPress={onSignOut} style={{ minHeight: 40 }} />
        </View>
        <View style={s.row}>
          <Stat label="On board" value={`${onBoard} / ${trip.children.length}`} />
          <Stat label="Handed over" value={String(done)} />
          <Stat label="Cameras" value={`${trip.vehicle.cameras_online}/${trip.vehicle.camera_count}`} />
        </View>

        {trip.status === 'scheduled' && (
          <Button label="Start trip" onPress={() => run(() => post(`/crew/trips/${trip.id}/start`))} busy={busy} />
        )}

        {trip.status === 'in_progress' && (
          <Card dark>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Board a child</Text>
            <Muted light>Tap the child's card on the reader, or type the card ID.</Muted>
            <TextInput style={[s.input, { backgroundColor: c.nightLine, color: '#fff', borderColor: c.nightLine }]}
              value={card} onChangeText={setCard} placeholder="Card ID" placeholderTextColor={c.nightMuted}
              autoCapitalize="characters" accessibilityLabel="Child card ID" />
            <Button label="Board" disabled={!card} busy={busy}
              onPress={() => run(async () => { await post(`/crew/trips/${trip.id}/board`, { card_uid: card }); setCard(''); })} />
          </Card>
        )}
        <ErrorText>{error}</ErrorText>

        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Manifest</Text>
        {trip.children.map(tc => (
          <View key={tc.id} style={{ gap: 8 }}>
            <Pressable disabled={tc.status !== 'on_board'} onPress={() => setOpen(open === tc.id ? null : tc.id)}
              accessibilityRole="button" accessibilityHint="Opens handover for this child">
              <Card dark style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>{tc.stop_order}. {tc.child.name}</Text>
                  <Muted light>{tc.child.home_address}</Muted>
                </View>
                <StatusPill status={tc.status} />
              </Card>
            </Pressable>
            {open === tc.id && tc.status === 'on_board' && (
              <HandoverPanel tripId={trip.id} tc={tc} onDone={() => { setOpen(null); load(); }} />
            )}
          </View>
        ))}

        <Card dark>
          <Muted light>Only the driver and escort may ride. Never let another adult board, even a parent. Hand over only after the PIN is confirmed.</Muted>
        </Card>
        {trip.status === 'in_progress' && (
          <Button label="End trip" kind="ghost" onPress={() => run(() => post(`/crew/trips/${trip.id}/end`))} />
        )}
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 24, borderTopWidth: 1, borderColor: c.nightLine }}>
        <Button label="SOS" kind="danger" onPress={sos} style={{ minHeight: 56 }} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card dark style={{ flex: 1, padding: 10, gap: 2 }}>
      <Muted light>{label}</Muted>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{value}</Text>
    </Card>
  );
}

function HandoverPanel({ tripId, tc, onDone }: { tripId: number; tc: TripChild; onDone: () => void }) {
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Receiver[]>(`/crew/trips/${tripId}/children/${tc.id}/receivers`).then(setReceivers).catch(() => {});
  }, [tripId, tc.id]);

  async function act(path: string, body: unknown) {
    setBusy(true);
    setError('');
    try { await post(path, body); onDone(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <Text style={{ fontWeight: '700', color: c.ink }}>Hand over {tc.child.name}</Text>
      <Muted>Who is receiving? Check their face against the photo on file.</Muted>
      {receivers.map(r => (
        <Button key={r.id} label={`${r.name} (${r.relationship_to_child})`} kind={chosen === r.id ? 'primary' : 'outline'}
          onPress={() => setChosen(r.id)} style={{ minHeight: 44 }} />
      ))}
      <TextInput style={s.input} value={pin} onChangeText={t => setPin(t.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad" placeholder="4-digit PIN from the adult" accessibilityLabel="Handover PIN" />
      <ErrorText>{error}</ErrorText>
      <Button label="Confirm handover" disabled={chosen === null || pin.length !== 4} busy={busy}
        onPress={() => act(`/crew/trips/${tripId}/handover`, { trip_child_id: tc.id, receiver_id: chosen, pin })} />
      <Button label="No approved adult here" kind="outline" busy={busy}
        onPress={() => act(`/crew/trips/${tripId}/no-receiver`, { trip_child_id: tc.id })} />
    </Card>
  );
}

/** Sends the vehicle's location to the server while the trip is running. */
function useLocationPings(tripId: number | null) {
  const last = useRef(0);
  useEffect(() => {
    if (tripId === null) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: PING_EVERY_MS, distanceInterval: 50 },
        pos => {
          const now = Date.now();
          if (now - last.current < PING_EVERY_MS / 2) return;
          last.current = now;
          post(`/crew/trips/${tripId}/ping`, {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            speed_kmh: Math.max(0, (pos.coords.speed ?? 0) * 3.6),
          }).catch(() => {}); // offline: the in-vehicle tracker remains the source of truth
        },
      );
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [tripId]);
}
