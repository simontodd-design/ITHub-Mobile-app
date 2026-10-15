import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/api';
import { prettyDate, ymd } from '@/format';
import { colors } from '@/theme';
import { font } from '@/theme';
import { BrandHeader, Button, Card, Meta, Notice, Pill, Screen } from '@/ui';

type LeaveKind = 'holiday' | 'sick';

type Leave = { id: number; starts_on: string; ends_on: string; reason: string | null; status: string; kind?: LeaveKind | 'off' };

function kindLabel(kind: Leave['kind']): string {
  if (kind === 'sick') {
    return 'Sick';
  }

  if (kind === 'off') {
    return 'Off';
  }

  return 'Holiday';
}

function daysBetween(start: string, end: string): number {
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T00:00:00`);
  let count = 0;

  for (const day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
    const weekday = day.getDay();

    if (weekday !== 0 && weekday !== 6) {
      count += 1;
    }
  }

  return count;
}

export default function LeaveScreen() {
  const [rows, setRows] = useState<Leave[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [allowance, setAllowance] = useState<number | null>(null);
  const [starts, setStarts] = useState(new Date());
  const [ends, setEnds] = useState(new Date());
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const [kind, setKind] = useState<LeaveKind>('holiday');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ leave: Leave[]; remaining_days: number; allowance_days: number }>('/mobile/leave');
    setRows(result.leave);
    setRemaining(result.remaining_days);
    setAllowance(result.allowance_days);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch((err: Error) => setMessage(err.message));
    }, [load]),
  );

  async function submit() {
    setBusy(true);
    setMessage(null);

    try {
      await api('/mobile/leave', {
        method: 'POST',
        body: { starts_on: ymd(starts), ends_on: ymd(ends < starts ? starts : ends), reason, kind },
      });
      setReason('');
      setMessage(kind === 'sick' ? 'Sick day recorded. The office can see it on the schedule.' : 'Holiday requested. The office approves it onto the schedule.');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen onRefresh={load} header={<BrandHeader eyebrow="Requests" title="Time off" />}>
      <Card>
        <View style={styles.row}>
          <Text style={styles.label}>Remaining this year</Text>
          <Text style={styles.days}>{remaining ?? '…'}</Text>
        </View>
        <Meta>
          {kind === 'sick'
            ? 'Sick days are recorded straight away and do not come off this balance.'
            : `${allowance ?? '…'} holiday days in the year. Approved weekdays come off that balance.`}
        </Meta>
      </Card>
      <View style={styles.kinds}>
        <Pressable onPress={() => setKind('holiday')} style={[styles.kind, kind === 'holiday' ? styles.kindOn : null]}>
          <Text style={kind === 'holiday' ? styles.kindOnText : styles.kindText}>Holiday</Text>
        </Pressable>
        <Pressable onPress={() => setKind('sick')} style={[styles.kind, kind === 'sick' ? styles.kindOn : null]}>
          <Text style={kind === 'sick' ? styles.kindOnText : styles.kindText}>Sick</Text>
        </Pressable>
      </View>
      <Card>
        <Pressable onPress={() => setPicking('start')} style={styles.date}>
          <Text style={styles.label}>From</Text>
          <Text style={styles.value}>{starts.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
        </Pressable>
        <Pressable onPress={() => setPicking('end')} style={styles.date}>
          <Text style={styles.label}>To</Text>
          <Text style={styles.value}>{ends.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
        </Pressable>
        <TextInput
          onChangeText={setReason}
          placeholder="Reason"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={reason}
        />
        <Button disabled={busy} label={busy ? 'Sending…' : kind === 'sick' ? 'Record sick day' : 'Request holiday'} onPress={submit} />
      </Card>
      {picking ? (
        <DateTimePicker
          mode="date"
          onChange={(_, date) => {
            setPicking(null);

            if (!date) {
              return;
            }

            if (picking === 'start') {
              setStarts(date);

              if (date > ends) {
                setEnds(date);
              }
            } else {
              setEnds(date);
            }
          }}
          value={picking === 'start' ? starts : ends}
        />
      ) : null}
      {message ? <Notice>{message}</Notice> : null}
      {rows.length === 0 ? <Meta>No requests yet.</Meta> : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.value}>
                {prettyDate(row.starts_on)} → {prettyDate(row.ends_on)}
              </Text>
              <Meta>
                {kindLabel(row.kind)}
                {' · '}
                {daysBetween(row.starts_on, row.ends_on)} weekday{daysBetween(row.starts_on, row.ends_on) === 1 ? '' : 's'}
                {row.reason ? ` · ${row.reason}` : ''}
              </Meta>
            </View>
            <Pill label={row.status} tone={row.status === 'approved' ? 'accent' : row.status === 'rejected' ? 'warn' : 'blue'} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 22, fontFamily: font.bold, color: colors.ink },
  date: { paddingVertical: 8 },
  label: { color: colors.muted },
  value: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  days: { color: colors.ink, fontWeight: '800', fontSize: 22 },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    color: colors.ink,
  },
  kinds: { flexDirection: 'row', gap: 8 },
  kind: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  kindOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  kindText: { color: colors.ink, fontFamily: font.bold },
  kindOnText: { color: '#fff', fontFamily: font.bold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
