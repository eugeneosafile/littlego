import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  api, ApiError, del, naira, post, time,
  type Child, type ParentTrip, type Price, type Receiver, type Stream, type TripChild, type User,
} from '../../api';
import TripMap from '../../components/TripMap';
import {
  Avatar, Body, Button, c, Card, Divider, ErrorText, f, Field, H1, Icon, IconButton, type IconName,
  JourneyTrack, LogoMark, Muted, Notice, s, SectionLabel, Segmented, StatusPill, Title,
} from '../../ui';

type Tab = 'home' | 'live' | 'book' | 'handover';
const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Today', icon: 'home' },
  { key: 'live', label: 'Live', icon: 'live' },
  { key: 'book', label: 'Plans', icon: 'ticket' },
  { key: 'handover', label: 'Handover', icon: 'key' },
];

export default function ParentApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
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
      setError(e instanceof ApiError ? e.message : 'Could not load today’s trips. Pull down to try again.');
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
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, gap: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.navy} colors={[c.navy]} />}>
        <ErrorText>{error}</ErrorText>
        {tab === 'home' && <Home user={user} trips={trips} children={children} go={setTab} onSignOut={onSignOut} />}
        {tab === 'live' && <Live trips={trips} />}
        {tab === 'book' && <Book children={children} />}
        {tab === 'handover' && <Handover trips={trips} />}
      </ScrollView>

      <View style={{
        flexDirection: 'row', backgroundColor: c.card, borderTopWidth: 1, borderColor: c.lineSoft,
        paddingBottom: Math.max(insets.bottom, 10), paddingTop: 6, paddingHorizontal: 8,
        boxShadow: '0px -8px 24px -16px rgba(10,31,63,0.18)',
      }} accessibilityRole="tablist">
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              accessibilityLabel={t.label} style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: on ? c.gold : 'transparent', marginBottom: 2 }} />
              <Icon name={t.icon} size={23} color={on ? c.navy : c.faint} stroke={on ? 2.1 : 1.8} />
              <Text style={{ fontFamily: on ? f.semi : f.medium, fontSize: 12, color: on ? c.navy : c.faint }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ---------------- Today ----------------
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
  const crewTrip = trips[0];
  return (
    <>
      <View style={[s.row, s.between]}>
        <LogoMark size={34} />
        <View style={s.row}>
          <IconButton icon="logout" label="Sign out" onPress={onSignOut} />
          <Avatar name={user.name} size={42} />
        </View>
      </View>

      <View style={{ gap: 4, marginTop: 6 }}>
        <Muted>{greeting()},</Muted>
        <H1>{user.name.split(' ')[0]}</H1>
      </View>

      {children.length === 0 && (
        <Card>
          <Title>No children linked yet</Title>
          <Muted>Your school adds children to LittleGo. Once they do, today’s journeys show here.</Muted>
        </Card>
      )}

      {children.map(ch => {
        const st = statusOf(ch.id);
        if (!st) {
          return (
            <Card key={ch.id} style={[s.row, s.between, { gap: 12 }]}>
              <View style={[s.row, { flex: 1 }]}>
                <Avatar name={ch.name} tone="sand" />
                <View style={{ flex: 1 }}>
                  <Title style={{ fontSize: 17 }}>{ch.name}</Title>
                  <Muted>{ch.class_name}</Muted>
                </View>
              </View>
              <Muted>No ride today</Muted>
            </Card>
          );
        }
        return <JourneyCard key={ch.id} child={ch} tc={st.tc} trip={st.trip} go={go} />;
      })}

      {crewTrip && (
        <>
          <SectionLabel>Today’s crew</SectionLabel>
          <Card style={{ gap: 14 }}>
            <CrewRow name={crewTrip.driver.name} role="Driver" vetted={!!crewTrip.driver.vetted_at} />
            <Divider />
            <CrewRow name={crewTrip.escort.name} role="Escort" vetted={!!crewTrip.escort.vetted_at} />
          </Card>
        </>
      )}

      <Card tone="sand" style={[s.row, { alignItems: 'flex-start', gap: 14 }]}>
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="shield" size={21} color={c.gold} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[s.section]}>Child-only, every ride</Text>
          <Muted>Only the vetted driver and escort ride with the children. No other adult may board, and cameras record every trip.</Muted>
        </View>
      </Card>
    </>
  );
}

function JourneyCard({ child, tc, trip, go }: { child: Child; tc: TripChild; trip: ParentTrip; go: (t: Tab) => void }) {
  const when = tc.status === 'handed_over' ? `Handed over at ${time(tc.handed_over_at)}`
    : tc.status === 'on_board' ? `Boarded at ${time(tc.boarded_at)}`
    : tc.status === 'released' ? `Released at the gate at ${time(tc.released_at)}`
    : tc.status === 'at_safe_hub' ? 'Waiting safely at the school’s hub. We will call you.'
    : tc.status === 'absent' ? 'Marked absent today'
    : 'Waiting for the school to release';
  return (
    <Card tone="navy" style={{ padding: 22, gap: 18, borderRadius: 28 }}>
      <View style={[s.row, s.between, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: f.display, fontSize: 24, letterSpacing: -0.6, color: '#fff' }}>{child.name}</Text>
          <Muted light>{child.class_name}</Muted>
        </View>
        <StatusPill status={tc.status} onDark />
      </View>
      {tc.status !== 'absent' && <JourneyTrack status={tc.status} light />}
      <View style={[s.row, { gap: 8 }]}>
        <Icon name={tc.status === 'handed_over' ? 'check' : 'clock'} size={17} color={c.teal300} />
        <Text style={{ fontFamily: f.medium, fontSize: 14, color: '#fff', flex: 1 }}>{when}</Text>
        <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.nightMuted }}>{trip.vehicle.code}</Text>
      </View>
      {tc.status === 'on_board' && (
        <View style={s.row}>
          <Button label="Watch live" kind="gold" icon="play" onPress={() => go('live')} style={{ flex: 1.3 }} />
          <Button label="PIN" kind="ghost" icon="key" onPress={() => go('handover')} style={{ flex: 1 }} />
        </View>
      )}
    </Card>
  );
}

function CrewRow({ name, role, vetted }: { name: string; role: string; vetted: boolean }) {
  return (
    <View style={[s.row, { gap: 12 }]}>
      <Avatar name={name} tone="teal" />
      <View style={{ flex: 1 }}>
        <Text style={s.section}>{name}</Text>
        <Muted>{role}</Muted>
      </View>
      <View style={[s.row, { gap: 5 }]}>
        <Icon name={vetted ? 'shield' : 'alert'} size={16} color={vetted ? c.tealInk : c.red} />
        <Text style={{ fontFamily: f.semi, fontSize: 13, color: vetted ? c.tealInk : c.red }}>{vetted ? 'Verified' : 'Not verified'}</Text>
      </View>
    </View>
  );
}

// ---------------- Live trip ----------------
function Live({ trips }: { trips: ParentTrip[] }) {
  const trip = trips.find(t => t.my_children.some(tc => tc.status === 'on_board' || tc.status === 'released')) ?? trips[0];
  const [stream, setStream] = useState<Stream | null>(null);
  const [lowData, setLowData] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!trip) {
    return (
      <>
        <H1>Live</H1>
        <Card style={{ alignItems: 'center', paddingVertical: 36 }}>
          <Icon name="bus" size={34} color={c.faint} />
          <Title>No trips today</Title>
          <Muted style={{ textAlign: 'center' }}>When your child has a ride, you can follow it here from the school gate to your door.</Muted>
        </Card>
      </>
    );
  }
  const mine = trip.my_children[0]?.child;
  const home = mine?.home_lat != null && mine.home_lon != null ? { lat: mine.home_lat, lon: mine.home_lon } : null;

  async function openLive() {
    setError('');
    setBusy(true);
    try {
      setStream(await api<Stream>(`/parent/trips/${trip!.trip_id}/live?low_data=${lowData}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Live view is not available right now.');
    } finally {
      setBusy(false);
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
      <View style={[s.row, s.between, { alignItems: 'flex-end' }]}>
        <View style={{ gap: 2 }}>
          <Muted>Live trip</Muted>
          <H1>{trip.vehicle.code}</H1>
        </View>
        {trip.my_children[0] && <StatusPill status={trip.my_children[0].status} />}
      </View>

      {/* Camera */}
      <View style={{ backgroundColor: c.navy950, borderRadius: 26, aspectRatio: 16 / 10, overflow: 'hidden', padding: 18, justifyContent: 'space-between' }}>
        <View style={[s.row, s.between]}>
          <View style={[s.row, { gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }]}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: stream ? '#EF4444' : c.nightMuted }} />
            <Text style={{ fontFamily: f.semi, fontSize: 12, color: '#fff' }}>{stream ? `Live, ${stream.bitrate_kbps} kbps` : 'Camera off'}</Text>
          </View>
          <Icon name="lock" size={18} color={c.nightMuted} />
        </View>
        {stream ? (
          <View style={{ gap: 4 }}>
            {/* Plug the DVR vendor's player here (HLS/WebRTC) using stream.url. */}
            <Text style={{ fontFamily: f.semi, color: '#fff', fontSize: 15 }}>Cameras: {stream.cameras.join(', ')}</Text>
            <Muted light>Video player goes here. This link expires in {Math.round(stream.expires_in_s / 60)} min.</Muted>
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera" size={26} color="#fff" />
            </View>
            <Muted light style={{ textAlign: 'center', maxWidth: 260 }}>Opens only while your child is on board. Every view is logged.</Muted>
          </View>
        )}
        <View />
      </View>

      <Segmented
        options={[{ value: 'low', label: 'Data saver' }, { value: 'hd', label: 'Full quality' }]}
        value={lowData ? 'low' : 'hd'} onChange={v => setLowData(v === 'low')} />
      <Button label={stream ? 'Refresh live view' : 'Open live view'} kind="gold" icon="play" onPress={openLive} busy={busy} />
      <ErrorText>{error}</ErrorText>

      <SectionLabel right={<Muted style={{ fontSize: 13 }}>{trip.last_ping_at ? `Updated ${time(trip.last_ping_at)}` : 'Waiting for location'}</Muted>}>
        Where they are
      </SectionLabel>
      <View style={{ borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
        <TripMap
          vehicle={trip.last_lat != null && trip.last_lon != null ? { lat: trip.last_lat, lon: trip.last_lon } : null}
          school={{ lat: trip.school_lat, lon: trip.school_lon }}
          home={home}
          label={trip.vehicle.code}
        />
      </View>

      <SectionLabel>Trip log</SectionLabel>
      <Card style={{ gap: 0 }}>
        {trip.timeline.length === 0 && <Muted>Nothing yet. Updates appear as the trip moves.</Muted>}
        {trip.timeline.map((e, i) => {
          const last = i === trip.timeline.length - 1;
          return (
            <View key={e.id} style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ alignItems: 'center', width: 14 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: i === 0 ? c.gold : c.teal }} />
                {!last && <View style={{ flex: 1, width: 2, backgroundColor: c.lineSoft, marginVertical: 3 }} />}
              </View>
              <View style={{ flex: 1, paddingBottom: last ? 0 : 16, gap: 2 }}>
                <Body style={{ fontFamily: f.medium }}>{e.message}</Body>
                <Muted style={{ fontSize: 13 }}>{time(e.created_at)}</Muted>
              </View>
            </View>
          );
        })}
      </Card>

      <SectionLabel>On board with them</SectionLabel>
      <Card style={{ gap: 14 }}>
        <CrewRow name={trip.driver.name} role="Driver" vetted={!!trip.driver.vetted_at} />
        <Divider />
        <CrewRow name={trip.escort.name} role="Escort" vetted={!!trip.escort.vetted_at} />
      </Card>

      <Button label="Raise a concern" kind="outline" icon="alert" onPress={confirmSos} style={{ borderColor: '#F3C9C4' }} />
      <Muted style={{ textAlign: 'center', fontSize: 13, marginTop: -6 }}>The 24/7 ops centre responds and calls you back.</Muted>
    </>
  );
}

// ---------------- Plans ----------------
const TIER_TEXT: Record<Price['tier'], { name: string; desc: string; icon: IconName }> = {
  shared: { name: 'Shared bus', desc: '14 to 18 seats on a fixed route.', icon: 'bus' },
  group: { name: 'Small group van', desc: '5 to 7 children from 2 or 3 families, with set time slots.', icon: 'users' },
  exclusive: { name: 'Exclusive car', desc: 'Your children only, on your times, with extra stops.', icon: 'car' },
};

function Book({ children }: { children: Child[] }) {
  const [prices, setPrices] = useState<Price[]>([]);
  const [tier, setTier] = useState<Price['tier']>('shared');
  const [childId, setChildId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'info'; text: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => { api<Price[]>('/parent/prices').then(setPrices).catch(() => {}); }, []);
  useEffect(() => { if (childId === null && children[0]) setChildId(children[0].id); }, [children, childId]);

  const selected = prices.find(p => p.tier === tier);

  async function book() {
    if (childId === null) return;
    setBusy(true);
    setMsg(null);
    setError('');
    try {
      const r = await post<{ booking: { id: number; status: string }; checkout_url: string }>('/parent/bookings', { child_id: childId, tier });
      if (r.booking.status === 'active') {
        setMsg({ kind: 'ok', text: 'Plan active. The school will confirm the seat.' });
      } else {
        setPending(r.booking.id);
        setMsg({ kind: 'info', text: 'Finish paying on the Paystack page (card, transfer or USSD), then come back and tap “I’ve paid”.' });
        await Linking.openURL(r.checkout_url);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Booking failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function checkPaid() {
    if (pending === null) return;
    setBusy(true);
    setError('');
    try {
      const b = await post<{ status: string }>(`/parent/bookings/${pending}/verify`);
      if (b.status === 'active') { setPending(null); setMsg({ kind: 'ok', text: 'Payment received. Your plan is active.' }); }
      else setMsg({ kind: 'info', text: 'Payment not received yet. It can take a minute after you pay.' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not check the payment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={{ gap: 4 }}>
        <H1>Ride plans</H1>
        <Muted>The same safety standard on every plan. Billed monthly per child.</Muted>
      </View>

      {children.length > 1 && (
        <Segmented options={children.map(ch => ({ value: ch.id, label: ch.name.split(' ')[0] }))}
          value={childId ?? children[0].id} onChange={setChildId} />
      )}

      <View style={{ gap: 12 }} accessibilityRole="radiogroup">
        {prices.map(p => {
          const on = tier === p.tier;
          const t = TIER_TEXT[p.tier];
          return (
            <Pressable key={p.tier} onPress={() => setTier(p.tier)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
              <Card style={[{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
                on && { borderColor: c.navy, borderWidth: 2, padding: 17, boxShadow: '0px 18px 36px -20px rgba(15,45,91,0.55)' }]}>
                <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.navy : c.sand2 }}>
                  <Icon name={t.icon} size={22} color={on ? c.gold : c.navy} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.section}>{t.name}</Text>
                  <Muted>{t.desc}</Muted>
                  <Text style={{ fontFamily: f.display, fontSize: 22, color: c.ink, letterSpacing: -0.5, marginTop: 6 }}>
                    {naira(p.monthly_price)}<Text style={{ fontFamily: f.body, fontSize: 14, color: c.muted }}> / month</Text>
                  </Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.navy : c.line, alignItems: 'center', justifyContent: 'center' }}>
                  {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.navy }} />}
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Card tone="sand" style={{ gap: 10 }}>
        <Text style={s.section}>Included on every plan</Text>
        {['Live and recorded CCTV', 'Vetted driver and escort', 'One-time PIN handover', 'SOS and a 24/7 ops centre'].map(x => (
          <View key={x} style={[s.row, { gap: 10 }]}>
            <Icon name="check" size={18} color={c.teal} stroke={2.2} />
            <Body>{x}</Body>
          </View>
        ))}
      </Card>

      <ErrorText>{error}</ErrorText>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Button label={selected ? `Pay ${naira(selected.monthly_price)} with Paystack` : 'Continue to payment'}
        kind="gold" size="lg" onPress={book} busy={busy} disabled={childId === null} />
      {pending !== null && <Button label="I’ve paid, check now" kind="outline" onPress={checkPaid} busy={busy} />}
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
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => { api<Receiver[]>('/parent/receivers').then(setReceivers).catch(() => {}); }, []);
  useEffect(load, [load]);

  const pins = trips.flatMap(t => t.my_children
    .filter(tc => t.handover_pins[String(tc.id)])
    .map(tc => ({ name: tc.child.name, pin: t.handover_pins[String(tc.id)], vehicle: t.vehicle.code })));

  async function add() {
    setError('');
    try {
      await post('/parent/receivers', { name, relationship_to_child: relation, phone });
      setName(''); setRelation(''); setPhone(''); setAdding(false);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add this person.');
    }
  }

  return (
    <>
      <View style={{ gap: 4 }}>
        <H1>Handover</H1>
        <Muted>Your child is handed only to an approved adult who gives the PIN.</Muted>
      </View>

      {pins.length === 0 && (
        <Card tone="navy" style={{ alignItems: 'center', paddingVertical: 28, borderRadius: 28 }}>
          <Icon name="key" size={30} color={c.gold} />
          <Text style={{ fontFamily: f.semi, fontSize: 16, color: '#fff' }}>No PIN yet today</Text>
          <Muted light style={{ textAlign: 'center', maxWidth: 280 }}>A one-time PIN appears here when your child boards. We also send it by SMS.</Muted>
        </Card>
      )}
      {pins.map(p => (
        <Card tone="navy" key={p.name} style={{ alignItems: 'center', paddingVertical: 26, gap: 16, borderRadius: 28 }}>
          <Muted light>{p.name}, on {p.vehicle}</Muted>
          <View style={[s.row, { gap: 10 }]} accessible accessibilityLabel={`Handover PIN ${p.pin.split('').join(' ')}`}>
            {p.pin.split('').map((d, i) => (
              <View key={i} style={{ width: 58, height: 70, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(244,180,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: f.displayBold, fontSize: 38, color: c.gold }}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={[s.row, { gap: 6 }]}>
            <Icon name="lock" size={15} color={c.nightMuted} />
            <Muted light style={{ fontSize: 13 }}>Share only with an approved adult</Muted>
          </View>
        </Card>
      ))}

      <SectionLabel right={!adding && <Button label="Add" icon="plus" kind="outline" size="sm" onPress={() => setAdding(true)} />}>
        Approved adults
      </SectionLabel>
      <Card style={{ gap: 14 }}>
        {receivers.length === 0 && <Muted>Add the people allowed to receive your children.</Muted>}
        {receivers.map((r, i) => (
          <View key={r.id} style={{ gap: 14 }}>
            {i > 0 && <Divider />}
            <View style={[s.row, { gap: 12 }]}>
              <Avatar name={r.name} tone="sand" />
              <View style={{ flex: 1 }}>
                <Text style={s.section}>{r.name}</Text>
                <Muted>{r.relationship_to_child}{r.phone ? `, ${r.phone}` : ''}</Muted>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${r.name}`} hitSlop={8}
                onPress={() => del(`/parent/receivers/${r.id}`).then(load)}>
                <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.muted }}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </Card>

      {adding && (
        <Card style={{ gap: 14 }}>
          <View style={[s.row, s.between]}>
            <Title>Add an approved adult</Title>
            <IconButton icon="x" label="Close" onPress={() => setAdding(false)} />
          </View>
          <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" />
          <Field label="Relationship" placeholder="For example, aunt" value={relation} onChangeText={setRelation} />
          <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <ErrorText>{error}</ErrorText>
          <Button label="Add person" onPress={add} disabled={!name || !phone} />
        </Card>
      )}

      <Notice kind="warn">No approved adult at home? Your child stays with the escort and goes to the school’s safe hub. We call you straight away.</Notice>
    </>
  );
}
