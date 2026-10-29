import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api';
import { clock, elapsed, greeting, mapsUrl } from '@/format';
import { answerOfficePrompt, startOfficeWatch, startShiftTracking, subscribeShiftFix } from '@/location';
import { flushQueue } from '@/offline';
import { colors } from '@/theme';
import { EmptyDay } from '@/art';
import { font } from '@/theme';
import { BrandHeader, Button, Card, Meta, Notice, Pill, Screen, useNow } from '@/ui';

type Visit = {
  id: number;
  label: string;
  starts_at: string | null;
  travel_minutes: number | null;
  completed_at: string | null;
  customer: { name: string } | null;
  ticket_id: number | null;
  ticket: { id: number; subject: string; is_fast_tracked: boolean } | null;
  site: { name: string; address: string; latitude?: string | number | null; longitude?: string | number | null } | null;
};

type Ticket = {
  id: number;
  subject: string;
  priority: string | number | null;
  is_fast_tracked: boolean;
  status: string | null;
  customer: { name: string } | null;
  site: { name: string } | null;
};

type Today = {
  shift: { clocked_in_at: string; workplace?: string | null } | null;
  visits: Visit[];
  tickets: Ticket[];
};

type OfficePrompt = { action: 'clock_in' | 'clock_out'; message: string; office_name: string };

type VisitChoice = { visit_id: number | null; ticket_id: number | null; label: string };

type VisitPrompt = {
  id: number;
  kind: 'arrived' | 'office' | 'gap' | 'return';
  message: string;
  stopped_at: string | null;
  arrived_at: string | null;
  choices: VisitChoice[];
};

type Me = {
  name: string;
  unread_alerts?: number;
  at_office?: boolean;
  office_prompt?: OfficePrompt | null;
  visit_prompt?: VisitPrompt | null;
  visit_notice?: string | null;
  callout: { id: number; phase: string; ticket_id: number | null; started_at: string | null; arrived_at: string | null } | null;
};

export default function TodayScreen() {
  const router = useRouter();
  const [today, setToday] = useState<Today | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [workplace, setWorkplace] = useState<'office' | 'home'>('office');
  const [leftAt, setLeftAt] = useState(() => new Date());
  const [backAt, setBackAt] = useState(() => new Date());
  const [picking, setPicking] = useState<'left' | 'back' | null>(null);
  const ticking = Boolean(today?.shift || me?.callout);
  const now = useNow(ticking);
  const phaseRef = useRef<string | null>(null);
  phaseRef.current = me?.callout?.phase ?? null;

  const load = useCallback(async () => {
    await flushQueue().catch(() => undefined);
    const [jobs, profile] = await Promise.all([api<Today>('/mobile/jobs/today'), api<Me>('/mobile/me')]);
    setToday(jobs);
    setMe(profile);

    if (jobs.shift) {
      startShiftTracking().catch(() => undefined);
    } else {
      startOfficeWatch().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const prompt = me?.visit_prompt;

    if (!prompt) {
      return;
    }

    setLeftAt(prompt.arrived_at ? new Date(prompt.arrived_at) : new Date());
    setBackAt(new Date());
  }, [me?.visit_prompt?.id]);

  useEffect(() => {
    return subscribeShiftFix((phase, officePrompt) => {
      if (phaseRef.current !== phase || officePrompt) {
        load().catch(() => undefined);
      }
    });
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load().catch((err: Error) => setMessage(err.message));
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);

    try {
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not refresh.');
    } finally {
      setRefreshing(false);
    }
  }

  function confirmClockOut(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        'Clock out?',
        'This ends the shift. You stay clocked in until you confirm.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Clock out', style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  }

  async function toggleShift(inShift: boolean) {
    if (!inShift && !(await confirmClockOut())) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      if (inShift) {
        await api('/mobile/clock-in', { method: 'POST', body: { workplace } });
        const warning = await startShiftTracking();
        setMessage(warning ?? 'Clocked in. Location is on until you clock out.');
      } else {
        await api('/mobile/clock-out', { method: 'POST' });
        const warning = await startOfficeWatch();
        setMessage(warning ?? 'Clocked out. The office will ask before clocking you in again.');
      }

      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Clock failed.');
    } finally {
      setBusy(false);
    }
  }

  async function answerVisit(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);

    try {
      const profile = await api<Me>('/mobile/visit-prompt', { method: 'POST', body });
      setMe(profile);
      setMessage(profile.visit_notice ?? 'Saved.');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  async function answerPrompt(decision: 'confirm' | 'dismiss') {
    if (!me?.office_prompt) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await answerOfficePrompt(decision, me.office_prompt.action);
      setMessage(decision === 'confirm' ? (me.office_prompt.action === 'clock_in' ? 'Clocked in.' : 'Clocked out.') : 'Left as it is.');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not confirm.');
    } finally {
      setBusy(false);
    }
  }

  const first = me?.name?.split(' ')[0] ?? 'there';
  const calloutPhase = me?.callout?.phase;
  const calloutSince = calloutPhase === 'on_site' ? me?.callout?.arrived_at ?? me?.callout?.started_at : calloutPhase === 'return' ? me?.callout?.started_at : me?.callout?.started_at;
  const calloutLabel = calloutPhase === 'on_site' ? 'On site' : calloutPhase === 'return' ? 'Driving back' : calloutPhase === 'held' ? 'Needs times' : 'On the way';

  return (
    <Screen
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <BrandHeader eyebrow={greeting()} title={first}>
          <View style={styles.chips}>
            {today?.shift ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{elapsed(today.shift.clocked_in_at, now)}</Text>
              </View>
            ) : null}
          </View>
        </BrandHeader>
      }
    >

      {me?.visit_notice ? <Notice>{me.visit_notice}</Notice> : null}

      {me?.visit_prompt ? (
        <Card accent={colors.green}>
          <Text style={styles.strong}>{me.visit_prompt.message}</Text>
          {me.visit_prompt.kind === 'arrived' ? (
            <View style={styles.stack}>
              {me.visit_prompt.choices.map((choice) => (
                <Button
                  disabled={busy}
                  key={`${choice.visit_id ?? 't'}-${choice.ticket_id ?? 'v'}`}
                  label={me.visit_prompt?.choices.length === 1 ? `Yes, ${choice.label}` : choice.label}
                  onPress={() => answerVisit({ decision: 'yes', visit_id: choice.visit_id, ticket_id: choice.ticket_id })}
                />
              ))}
              <Button disabled={busy} label="Not a job" onPress={() => answerVisit({ decision: 'not_a_job' })} tone="ghost" />
            </View>
          ) : null}
          {me.visit_prompt.kind === 'office' ? (
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button disabled={busy} label="Yes" onPress={() => answerVisit({ decision: 'office' })} />
              </View>
              <View style={styles.flex}>
                <Button disabled={busy} label="Not yet" onPress={() => answerVisit({ decision: 'not_a_job' })} tone="ghost" />
              </View>
            </View>
          ) : null}
          {me.visit_prompt.kind === 'gap' || me.visit_prompt.kind === 'return' ? (
            <View style={styles.stack}>
              {me.visit_prompt.kind === 'gap' ? (
                <Pressable onPress={() => setPicking('left')}>
                  <Text style={styles.link}>Left the customer · {leftAt.toLocaleString()}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setPicking('back')}>
                <Text style={styles.link}>Back at the office · {backAt.toLocaleString()}</Text>
              </Pressable>
              {picking ? (
                <DateTimePicker
                  mode="datetime"
                  value={picking === 'left' ? leftAt : backAt}
                  onChange={(_event, date) => {
                    setPicking(null);
                    if (!date) {
                      return;
                    }
                    if (picking === 'left') {
                      setLeftAt(date);
                    } else {
                      setBackAt(date);
                    }
                  }}
                />
              ) : null}
              <Button
                disabled={busy}
                label="Save times"
                onPress={() => answerVisit(me.visit_prompt?.kind === 'gap'
                  ? { decision: 'times', left_at: leftAt.toISOString(), back_at: backAt.toISOString() }
                  : { decision: 'return', back_at: backAt.toISOString() })}
              />
              <Button disabled={busy} label="I already logged this" onPress={() => answerVisit({ decision: 'already_logged' })} tone="ghost" />
            </View>
          ) : null}
        </Card>
      ) : null}

      {me?.office_prompt ? (
        <Card accent={colors.green}>
          <Text style={styles.strong}>{me.office_prompt.message}</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button
                disabled={busy}
                label={me.office_prompt.action === 'clock_in' ? 'Clock in' : 'Clock out'}
                onPress={() => answerPrompt('confirm')}
                tone={me.office_prompt.action === 'clock_out' ? 'danger' : 'accent'}
              />
            </View>
            <View style={styles.flex}>
              <Button disabled={busy} label="Not now" onPress={() => answerPrompt('dismiss')} tone="ghost" />
            </View>
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Meta>
              {today?.shift
                ? `Clocked in at ${clock(today.shift.clocked_in_at)} · ${today.shift.workplace === 'home' ? 'Home' : 'Office'}`
                : 'Not clocked in'}
            </Meta>
            <Text style={styles.strong}>{today?.shift ? `${elapsed(today.shift.clocked_in_at, now)} today` : 'Where are you working?'}</Text>
            {today?.shift ? null : (
              <View style={styles.places}>
                <Pressable
                  onPress={() => setWorkplace('office')}
                  style={[styles.place, workplace === 'office' && styles.placeOn]}
                >
                  <Text style={styles.placeText}>Office</Text>
                </Pressable>
                <Pressable
                  onPress={() => setWorkplace('home')}
                  style={[styles.place, workplace === 'home' && styles.placeOn]}
                >
                  <Text style={styles.placeText}>Home</Text>
                </Pressable>
              </View>
            )}
          </View>
          <Button
            disabled={busy}
            label={today?.shift ? 'Clock out' : 'Clock in'}
            onPress={() => toggleShift(!today?.shift)}
            tone={today?.shift ? 'danger' : 'accent'}
          />
        </View>
      </Card>

      {me?.callout ? (
        <Card accent={me.callout.phase === 'on_site' ? colors.green : colors.blue}>
          <View style={styles.row}>
            <Pill label={calloutLabel} tone={me.callout.phase === 'on_site' ? 'accent' : 'blue'} />
            {calloutPhase === 'held' ? null : <Text style={styles.clock}>{elapsed(calloutSince, now)}</Text>}
          </View>
          <Meta>
            {me.callout.phase === 'return'
              ? 'Driving back. Reaching the office logs this drive on the job.'
              : me.callout.phase === 'held'
                ? 'The phone was off, so this visit is waiting for the times above.'
                : me.callout.phase === 'travel'
                  ? 'On the way. Arriving at the site switches this to time on site.'
                  : 'On site. Leaving starts the drive back, which stays on this job if it is the last one.'}
          </Meta>
          {me.callout.ticket_id ? (
            <Pressable onPress={() => router.push(`/job/${me.callout?.ticket_id}`)}>
              <Text style={styles.link}>Open the job</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {message ? <Notice>{message}</Notice> : null}

      <View style={styles.row}>
        <Text style={styles.section}>Today's jobs</Text>
        <Meta>{today?.visits.length ?? 0} scheduled</Meta>
      </View>

      {(today?.visits ?? []).map((visit) => (
        <Card key={visit.id} accent={visit.ticket?.is_fast_tracked ? colors.green : undefined}>
          <Pressable onPress={() => (visit.ticket_id ? router.push(`/job/${visit.ticket_id}?visit=${visit.id}`) : undefined)}>
            <View style={styles.row}>
              <Text style={styles.strong}>{visit.label}</Text>
              <Text style={styles.time}>{clock(visit.starts_at)}</Text>
            </View>
            <Meta>
              {visit.customer?.name ?? 'No customer'}
              {visit.site?.name ? ` · ${visit.site.name}` : ''}
              {visit.travel_minutes ? ` · ${visit.travel_minutes} min travel` : ''}
              {visit.completed_at ? ' · Done' : ''}
            </Meta>
            {mapsUrl(visit.site) ? (
              <Pressable onPress={() => Linking.openURL(mapsUrl(visit.site) as string)}>
                <Text style={styles.link}>Directions</Text>
              </Pressable>
            ) : null}
            {visit.ticket?.is_fast_tracked ? <Pill label="Fast Track" tone="accent" /> : null}
          </Pressable>
        </Card>
      ))}
      {(today?.visits.length ?? 0) === 0 ? (
        <View style={styles.empty}>
          <EmptyDay />
          <Meta>No visits booked. A stop of about 10 minutes asks if you have arrived.</Meta>
        </View>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.section}>Open jobs</Text>
        {(today?.tickets.length ?? 0) > 3 ? (
          <Pressable onPress={() => router.push('/tickets')}>
            <Text style={styles.link}>All {today?.tickets.length}</Text>
          </Pressable>
        ) : null}
      </View>
      {(today?.tickets ?? []).slice(0, 3).map((ticket) => (
        <Pressable key={ticket.id} onPress={() => router.push(`/job/${ticket.id}`)}>
          <Card>
            <Text numberOfLines={1} style={styles.strong}>
              {ticket.subject}
            </Text>
            <Meta>
              {ticket.customer?.name ?? 'No customer'}
              {ticket.status ? ` · ${ticket.status}` : ''}
            </Meta>
          </Card>
        </Pressable>
      ))}
      {(today?.tickets.length ?? 0) === 0 ? <Meta>No open jobs assigned to you.</Meta> : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: '#fff', fontFamily: font.bold },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  flex: { flex: 1 },
  strong: { fontFamily: font.bold, color: colors.ink, fontSize: 16, flexShrink: 1 },
  section: { fontFamily: font.bold, color: colors.ink, fontSize: 16 },
  time: { color: colors.muted, fontWeight: '700' },
  clock: { fontVariant: ['tabular-nums'], fontWeight: '800', color: colors.ink, fontSize: 18 },
  link: { color: colors.accent, fontWeight: '700' },
  stack: { gap: 8, marginTop: 8 },
  places: { flexDirection: 'row', gap: 8, marginTop: 10 },
  place: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  placeOn: { borderColor: colors.ink, borderWidth: 2 },
  placeText: { fontFamily: font.bold, color: colors.ink, fontSize: 14 },
});
