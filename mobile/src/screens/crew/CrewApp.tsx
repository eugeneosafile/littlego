import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError, post, type CrewTrip, type Receiver, type TripChild, type User } from '../../api';
import QrScanner from '../../components/QrScanner';
import {
  Avatar, Button, c, Card, ErrorText, f, Field, H1, Icon, IconButton, LogoMark, Muted, s, SectionLabel, StatusPill, Title,
} from '../../ui';

const PING_EVERY_MS = 30_000;

export default function CrewApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
  const [trip, setTrip] = useState<CrewTrip | null>(null);
  const [card, setCard] = useState('');
  const [open, setOpen] = useState<number | null>(null); // trip_child_id being handed over
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [typing, setTyping] = useState(false);

  const load = useCallback(async () => {
    try {
      const trips = await api<CrewTrip[]>('/crew/trips/today');
      setTrip(trips.find(t => t.status !== 'completed') ?? trips[0] ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load today’s trip.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  useLocationPings(trip?.status === 'in_progress' ? trip.id : null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try { await fn(); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'That didn’t work. Try again.'); }
    finally { setBusy(false); }
  }

  const role = user.crew_role === 'driver' ? 'Driver' : 'Escort';

  if (!trip) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center', backgroundColor: c.night }}>
        <LogoMark size={44} reversed />
        <H1 light>No trip assigned today</H1>
        <Muted light>When ops assigns you to a vehicle, the trip and manifest appear here.</Muted>
        <ErrorText>{error}</ErrorText>
        <Button label="Check again" kind="gold" onPress={load} />
        <Button label="Sign out" kind="ghost" onPress={onSignOut} />
      </View>
    );
  }

  const onBoard = trip.children.filter(x => x.status === 'on_board').length;
  const done = trip.children.filter(x => x.status === 'handed_over' || x.status === 'at_safe_hub').length;
  const camsOk = trip.vehicle.cameras_online === trip.vehicle.camera_count;
  const statusLabel = { scheduled: 'Not started', in_progress: 'On the road', completed: 'Completed' }[trip.status] ?? trip.status;

  function sos() {
    Alert.alert('Send SOS?', 'The ops centre will be alerted and will call you immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send SOS', style: 'destructive', onPress: () => run(() => post(`/crew/trips/${trip!.id}/sos`, { note: '' })) },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.night }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, gap: 14, paddingBottom: 32 }}>
        <View style={[s.row, s.between]}>
          <View style={[s.row, { gap: 12, flex: 1 }]}>
            <Avatar name={user.name} size={42} tone="teal" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: f.semi, fontSize: 15, color: '#fff' }}>{user.name}</Text>
              <Muted light>{role}, {trip.school.name}</Muted>
            </View>
          </View>
          <IconButton icon="logout" label="Sign out" onPress={onSignOut} light />
        </View>

        {/* Vehicle hero */}
        <View style={{ backgroundColor: c.navy, borderRadius: 28, padding: 22, gap: 18, marginTop: 4 }}>
          <View style={[s.row, s.between]}>
            <View style={[s.row, { gap: 8, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 }]}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: trip.status === 'in_progress' ? c.teal300 : c.nightMuted }} />
              <Text style={{ fontFamily: f.semi, fontSize: 13, color: '#fff' }}>{statusLabel}</Text>
            </View>
            <Icon name="bus" size={22} color={c.nightMuted} />
          </View>
          <Text style={{ fontFamily: f.displayBold, fontSize: 44, lineHeight: 46, letterSpacing: -1.5, color: '#fff' }}>{trip.vehicle.code}</Text>
          <View style={[s.row, { gap: 0 }]}>
            <Stat label="On board" value={`${onBoard}/${trip.children.length}`} />
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: c.nightLine }} />
            <Stat label="Handed over" value={String(done)} />
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: c.nightLine }} />
            <Stat label="Cameras" value={`${trip.vehicle.cameras_online}/${trip.vehicle.camera_count}`} warn={!camsOk} />
          </View>
        </View>

        {trip.status === 'scheduled' && (
          <Button label="Start trip" kind="gold" size="lg" icon="play" onPress={() => run(() => post(`/crew/trips/${trip.id}/start`))} busy={busy} />
        )}

        {trip.status === 'in_progress' && (
          <Card dark style={{ gap: 14, borderRadius: 24 }}>
            <Title light>Board a child</Title>
            <Muted light>Scan the QR code on the child’s card. Only children the school has released can board.</Muted>
            <Button label="Scan card" kind="gold" size="lg" icon="qr" onPress={() => setScanning(true)} busy={busy} />
            {typing ? (
              <View style={{ gap: 10 }}>
                <Field dark label="Card ID" value={card} onChangeText={setCard} placeholder="For example, LG-0001" autoCapitalize="characters" autoFocus />
                <Button label="Board" kind="ghost" disabled={!card} busy={busy}
                  onPress={() => run(async () => { await post(`/crew/trips/${trip.id}/board`, { card_uid: card.trim().toUpperCase() }); setCard(''); setTyping(false); })} />
              </View>
            ) : (
              <Pressable onPress={() => setTyping(true)} accessibilityRole="button" style={{ alignSelf: 'center', padding: 6 }}>
                <Text style={{ fontFamily: f.semi, fontSize: 15, color: c.nightMuted }}>Card won’t scan? Type the ID</Text>
              </Pressable>
            )}
          </Card>
        )}
        <ErrorText>{error}</ErrorText>

        <SectionLabel light right={<Muted light style={{ fontSize: 13 }}>In drop-off order</Muted>}>Manifest</SectionLabel>
        <View style={{ gap: 10 }}>
          {trip.children.map(tc => {
            const active = tc.status === 'on_board';
            const expanded = open === tc.id && active;
            return (
              <View key={tc.id} style={{ gap: 8 }}>
                <Pressable disabled={!active} onPress={() => setOpen(open === tc.id ? null : tc.id)}
                  accessibilityRole="button" accessibilityHint="Opens handover for this child"
                  style={({ pressed }) => [{
                    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20,
                    backgroundColor: expanded ? c.navy : c.nightCard, borderWidth: 1, borderColor: active ? c.navy600 : c.nightLine,
                  }, pressed && { opacity: 0.85 }]}>
                  <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.gold : c.nightLine }}>
                    <Text style={{ fontFamily: f.displayBold, fontSize: 16, color: active ? c.navy950 : c.nightMuted }}>{tc.stop_order}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: f.semi, fontSize: 16, color: '#fff' }}>{tc.child.name}</Text>
                    <Muted light style={{ fontSize: 13 }} >{tc.child.home_address}</Muted>
                  </View>
                  {active ? <Icon name="chevron" size={20} color={c.gold} /> : <StatusPill status={tc.status} onDark />}
                </Pressable>
                {expanded && <HandoverPanel tripId={trip.id} tc={tc} onDone={() => { setOpen(null); load(); }} />}
              </View>
            );
          })}
        </View>

        <View style={[s.row, { alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: c.nightLine }]}>
          <Icon name="shield" size={20} color={c.gold} />
          <Muted light style={{ flex: 1 }}>Only the driver and escort may ride. Never let another adult board, even a parent. Hand over only after the PIN is confirmed.</Muted>
        </View>
        {trip.status === 'in_progress' && (
          <Button label="End trip" kind="ghost" onPress={() => run(() => post(`/crew/trips/${trip.id}/end`))} />
        )}
      </ScrollView>
      <QrScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onScan={uid => { setScanning(false); run(() => post(`/crew/trips/${trip.id}/board`, { card_uid: uid })); }}
      />
      <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16), borderTopWidth: 1, borderColor: c.nightLine, backgroundColor: c.night }}>
        <Button label="SOS" kind="danger" size="lg" icon="sos" onPress={sos} accessibilityLabel="Send SOS to the ops centre" />
      </View>
    </View>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontFamily: f.display, fontSize: 24, color: warn ? c.gold : '#fff', letterSpacing: -0.4 }}>{value}</Text>
      <Muted light style={{ fontSize: 12 }}>{label}</Muted>
    </View>
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
    catch (e) { setError(e instanceof ApiError ? e.message : 'That didn’t work. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <Card style={{ borderRadius: 24, gap: 14 }}>
      <View style={{ gap: 3 }}>
        <Title>Hand over {tc.child.name.split(' ')[0]}</Title>
        <Muted>Who is receiving? Check their face against the photo on file.</Muted>
      </View>
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {receivers.map(r => {
          const on = chosen === r.id;
          return (
            <Pressable key={r.id} onPress={() => setChosen(r.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={[s.row, { gap: 12, padding: 12, borderRadius: 16, borderWidth: on ? 2 : 1, borderColor: on ? c.navy : c.line, backgroundColor: on ? c.navy100 : c.card }]}>
              <Avatar name={r.name} size={36} tone={on ? 'navy' : 'sand'} />
              <View style={{ flex: 1 }}>
                <Text style={s.section}>{r.name}</Text>
                <Muted style={{ fontSize: 13 }}>{r.relationship_to_child}</Muted>
              </View>
              {on && <Icon name="check" size={20} color={c.navy} stroke={2.4} />}
            </Pressable>
          );
        })}
        {receivers.length === 0 && <Muted>No approved adults on file. Use the safe hub.</Muted>}
      </View>
      <Field label="PIN from the adult" value={pin} onChangeText={t => setPin(t.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad" placeholder="••••" style={{ fontFamily: f.display, fontSize: 26, letterSpacing: 14, textAlign: 'center' }} />
      <ErrorText>{error}</ErrorText>
      <Button label="Confirm handover" kind="primary" icon="check" disabled={chosen === null || pin.length !== 4} busy={busy}
        onPress={() => act(`/crew/trips/${tripId}/handover`, { trip_child_id: tc.id, receiver_id: chosen, pin })} />
      <Button label="No approved adult here" kind="outline" icon="hub" busy={busy}
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
