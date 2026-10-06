import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import {
  api, ApiError, del, naira, post, time,
  type Child, type ParentTrip, type Price, type Receiver, type Stream, type User,
} from '../../api';
import { Button, c, Card, ErrorText, H1, Muted, s, StatusPill } from '../../ui';

type Tab = 'home' | 'live' | 'book' | 'handover';

export default function ParentApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('home');
  const [trips, setTrips] = useState<ParentTrip[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [t, ch] = await Promise.all([api<ParentTrip[]>('/parent/trips/today'), api<Child[]>('/parent/children')]);
      setTrips(t);
      setChildren(ch);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000); // trip status refresh
    return () => clearInterval(id);
  }, [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <ErrorText>{error}</ErrorText>
        {tab === 'home' && <Home user={user} trips={trips} children={children} go={setTab} onSignOut={onSignOut} />}
        {tab === 'live' && <Live trips={trips} />}
        {tab === 'book' && <Book children={children} />}
        {tab === 'handover' && <Handover trips={trips} />}
      </ScrollView>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: c.line, backgroundColor: '#fff', paddingBottom: 18 }}>
        {(['home', 'live', 'book', 'handover'] as Tab[]).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}
            style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '700', fontSize: 13, color: tab === t ? c.green : c.muted }}>
              {{ home: 'Home', live: 'Live', book: 'Book', handover: 'Handover' }[t]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------- Home ----------------
function Home({ user, trips, children, go, onSignOut }: {
  user: User; trips: ParentTrip[]; children: Child[]; go: (t: Tab) => void; onSignOut: () => void;
}) {
  const statusOf = (childId: number) => {
    for (const t of trips) {
      const tc = t.my_children.find(x => x.child.id === childId);
      if (tc) return { tc, trip: t };
    }
    return null;
  };
  return (
    <>
      <View style={[s.row, s.between]}>
        <View>
          <Muted>Good day,</Muted>
          <H1>{user.name}</H1>
        </View>
        <Button label="Sign out" kind="outline" onPress={onSignOut} style={{ minHeight: 40 }} />
      </View>
      {children.map(ch => {
        const st = statusOf(ch.id);
        return (
          <Card key={ch.id}>
            <View style={[s.row, s.between]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', fontSize: 16, color: c.ink }}>{ch.name}</Text>
                <Muted>{ch.class_name}</Muted>
              </View>
              {st ? <StatusPill status={st.tc.status} /> : <Muted>No ride today</Muted>}
            </View>
            {st && (
              <>
                <Muted>{st.trip.vehicle.code} · {st.trip.driver.name} (driver) and {st.trip.escort.name} (escort)</Muted>
                {st.tc.boarded_at && <Muted>Boarded at {time(st.tc.boarded_at)}</Muted>}
                {st.tc.status === 'on_board' && (
                  <View style={s.row}>
                    <Button label="Watch live" onPress={() => go('live')} style={{ flex: 1 }} />
                    <Button label="Handover PIN" kind="outline" onPress={() => go('handover')} style={{ flex: 1 }} />
                  </View>
                )}
              </>
            )}
          </Card>
        );
      })}
      <Card dark>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Child-only ride, always</Text>
        <Muted light>Only a vetted driver and escort ride with the children. No other adult may board, and cameras record every trip.</Muted>
      </Card>
    </>
  );
}

// ---------------- Live trip ----------------
function Live({ trips }: { trips: ParentTrip[] }) {
  const trip = trips.find(t => t.my_children.some(tc => tc.status === 'on_board' || tc.status === 'released')) ?? trips[0];
  const [stream, setStream] = useState<Stream | null>(null);
  const [lowData, setLowData] = useState(true);
  const [error, setError] = useState('');

  if (!trip) return <><H1>Live</H1><Muted>No trips today.</Muted></>;

  async function openLive() {
    setError('');
    try {
      setStream(await api<Stream>(`/parent/trips/${trip!.trip_id}/live?low_data=${lowData}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Live view unavailable');
    }
  }

  function confirmSos() {
    Alert.alert('Raise a concern?', 'The 24/7 ops centre will be alerted straight away and will call you.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Alert ops', style: 'destructive', onPress: () => post(`/parent/trips/${trip!.trip_id}/sos`, { note: 'Raised by parent' }) },
    ]);
  }

  return (
    <>
      <H1>{trip.vehicle.code} live</H1>
      <Card dark style={{ minHeight: 180, justifyContent: 'center' }}>
        {stream ? (
          <>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Connected · {stream.bitrate_kbps} kbps</Text>
            <Muted light>Cameras: {stream.cameras.join(', ')}</Muted>
            {/* Plug the DVR vendor's player here (HLS/WebRTC) using stream.url. */}
            <Muted light>Video player goes here. Link expires in {Math.round(stream.expires_in_s / 60)} min.</Muted>
          </>
        ) : (
          <Muted light>Live view opens only while your child is on this vehicle. Every view is logged.</Muted>
        )}
      </Card>
      <View style={s.row}>
        <Button label={lowData ? 'Low-data mode: on' : 'Low-data mode: off'} kind="outline" onPress={() => setLowData(!lowData)} style={{ flex: 1 }} />
        <Button label="Open live view" onPress={openLive} style={{ flex: 1 }} />
      </View>
      <ErrorText>{error}</ErrorText>
      <Card>
        <Text style={{ fontWeight: '700', color: c.ink }}>Location</Text>
        {trip.last_lat != null
          ? <Muted>Last seen {time(trip.last_ping_at)} at {trip.last_lat.toFixed(4)}, {trip.last_lon?.toFixed(4)}</Muted>
          : <Muted>Waiting for the first location update.</Muted>}
        {/* Swap for react-native-maps or a Google Maps view in the next iteration. */}
      </Card>
      <Card>
        <Text style={{ fontWeight: '700', color: c.ink }}>Trip log</Text>
        {trip.timeline.length === 0 && <Muted>No updates yet.</Muted>}
        {trip.timeline.map(e => (
          <View key={e.id} style={{ gap: 2 }}>
            <Text style={{ fontWeight: '600', color: c.ink }}>{time(e.created_at)}</Text>
            <Muted>{e.message}</Muted>
          </View>
        ))}
      </Card>
      <Card>
        <Text style={{ fontWeight: '700', color: c.ink }}>Crew on board</Text>
        <Muted>{trip.driver.name}, driver · {trip.driver.vetted_at ? 'Verified' : 'Not verified'}</Muted>
        <Muted>{trip.escort.name}, escort · {trip.escort.vetted_at ? 'Verified' : 'Not verified'}</Muted>
      </Card>
      <Button label="Raise a concern" kind="danger" onPress={confirmSos} />
    </>
  );
}

// ---------------- Book ----------------
const TIER_TEXT = {
  shared: { name: 'Shared bus', desc: '14 to 18 seat bus on a fixed route.' },
  group: { name: 'Small group van', desc: '5 to 7 children from 2 or 3 families. Set time slots.' },
  exclusive: { name: 'Exclusive car', desc: 'Your children only. Your own times and extra stops.' },
};

function Book({ children }: { children: Child[] }) {
  const [prices, setPrices] = useState<Price[]>([]);
  const [tier, setTier] = useState<Price['tier']>('shared');
  const [childId, setChildId] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<Price[]>('/parent/prices').then(setPrices).catch(() => {}); }, []);
  useEffect(() => { if (childId === null && children[0]) setChildId(children[0].id); }, [children, childId]);

  async function book() {
    if (childId === null) return;
    setBusy(true);
    try {
      const r = await post<{ booking: { status: string }; checkout_url: string }>('/parent/bookings', { child_id: childId, tier });
      // With a real payment provider, open r.checkout_url in the browser here.
      setMsg(r.booking.status === 'active' ? 'Plan active. The school will confirm the seat.' : 'Complete payment to activate.');
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Booking failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <H1>Choose a ride plan</H1>
      <Muted>Same safety standard on every plan.</Muted>
      <View style={[s.row, { flexWrap: 'wrap' }]}>
        {children.map(ch => (
          <Button key={ch.id} label={ch.name.split(' ')[0]} kind={childId === ch.id ? 'primary' : 'outline'}
            onPress={() => setChildId(ch.id)} style={{ minHeight: 40 }} />
        ))}
      </View>
      {prices.map(p => (
        <Pressable key={p.tier} onPress={() => setTier(p.tier)} accessibilityRole="radio" accessibilityState={{ selected: tier === p.tier }}>
          <Card style={tier === p.tier ? { borderColor: c.green, borderWidth: 2, backgroundColor: '#F1F8F4' } : undefined}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: c.ink }}>{TIER_TEXT[p.tier].name}</Text>
            <Muted>{TIER_TEXT[p.tier].desc}</Muted>
            <Text style={{ fontWeight: '700', color: c.ink }}>{naira(p.monthly_price)} per child / month</Text>
          </Card>
        </Pressable>
      ))}
      <Card style={{ backgroundColor: c.greenSoft, borderColor: c.greenSoft }}>
        <Text style={{ color: c.greenInk }}>Every plan: live and recorded CCTV, vetted driver and escort, PIN handover, SOS and a 24/7 ops centre.</Text>
      </Card>
      <Button label={`Continue with ${TIER_TEXT[tier].name.toLowerCase()}`} onPress={book} busy={busy} />
      {msg ? <Text style={{ color: c.greenInk, fontWeight: '600' }}>{msg}</Text> : null}
    </>
  );
}

// ---------------- Handover ----------------
function Handover({ trips }: { trips: ParentTrip[] }) {
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => { api<Receiver[]>('/parent/receivers').then(setReceivers).catch(() => {}); }, []);
  useEffect(load, [load]);

  const pins = trips.flatMap(t => t.my_children
    .filter(tc => t.handover_pins[String(tc.id)])
    .map(tc => ({ name: tc.child.name, pin: t.handover_pins[String(tc.id)], vehicle: t.vehicle.code })));

  async function add() {
    setError('');
    try {
      await post('/parent/receivers', { name, relationship_to_child: relation, phone });
      setName(''); setRelation(''); setPhone('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add');
    }
  }

  return (
    <>
      <H1>Handover</H1>
      {pins.length === 0 && <Muted>A one-time PIN appears here when your child boards. It is also sent by SMS.</Muted>}
      {pins.map(p => (
        <Card dark key={p.name} style={{ alignItems: 'center' }}>
          <Muted light>{p.name} · {p.vehicle}</Muted>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: 12 }} accessibilityLabel={`PIN ${p.pin.split('').join(' ')}`}>{p.pin}</Text>
          <Muted light>Share only with an approved adult</Muted>
        </Card>
      ))}
      <Card>
        <Text style={{ fontWeight: '700', color: c.ink }}>Approved to receive your children</Text>
        {receivers.map(r => (
          <View key={r.id} style={[s.row, s.between]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: c.ink }}>{r.name}</Text>
              <Muted>{r.relationship_to_child} · {r.phone}</Muted>
            </View>
            <Button label="Remove" kind="outline" style={{ minHeight: 40 }}
              onPress={() => del(`/parent/receivers/${r.id}`).then(load)} />
          </View>
        ))}
      </Card>
      <Card>
        <Text style={{ fontWeight: '700', color: c.ink }}>Add an approved adult</Text>
        <TextInput style={s.input} placeholder="Full name" value={name} onChangeText={setName} accessibilityLabel="Full name" />
        <TextInput style={s.input} placeholder="Relationship, e.g. Aunt" value={relation} onChangeText={setRelation} accessibilityLabel="Relationship" />
        <TextInput style={s.input} placeholder="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel="Phone number" />
        <ErrorText>{error}</ErrorText>
        <Button label="Add person" onPress={add} disabled={!name || !phone} />
      </Card>
      <Card style={{ backgroundColor: c.amberSoft, borderColor: c.amberSoft }}>
        <Text style={{ color: c.amberInk }}>No approved adult at home? Your child stays with the escort and goes to the school's safe hub. We call you straight away.</Text>
      </Card>
    </>
  );
}
