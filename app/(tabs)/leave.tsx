import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/api';
import { prettyDate, ymd } from '@/format';
import { colors } from '@/theme';
import { font } from '@/theme';
import { BrandHeader, Button, Card, Meta, Notice, Pill, Screen } from '@/ui';

type LeaveKind = 'holiday' | 'sick';

type Leave = {
  id: number;
  starts_on: string;
  ends_on: string;
  reason: string | null;
  cancel_reason?: string | null;
  status: string;
  kind?: LeaveKind | 'off';
};

function statusLabel(status: string): string {
  if (status === 'pending') {
    return 'Waiting';
  }

  if (status === 'approved') {
    return 'Approved';
  }

  if (status === 'cancel_requested') {
    return 'Cancellation waiting';
  }

  if (status === 'rejected') {
    return 'Not approved';
  }

  if (status === 'cancelled') {
    return 'Cancelled';
  }

  return status;
}

function statusTone(status: string): 'muted' | 'blue' | 'accent' | 'warn' {
  if (status === 'approved') {
    return 'accent';
  }

  if (status === 'rejected' || status === 'cancel_requested') {
    return 'warn';
  }

  if (status === 'cancelled') {
    return 'muted';
  }

  return 'blue';
}

function kindLabel(kind: Leave['kind']): string {
  if (kind === 'sick') {
    return 'Sick';
  }

  if (kind === 'off') {
    return 'Off';
  }

  return 'Holiday';
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(1 - lead);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
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
  const [starts, setStarts] = useState(() => startOfDay(new Date()));
  const [ends, setEnds] = useState(() => startOfDay(new Date()));
  const [awaitingEnd, setAwaitingEnd] = useState(false);
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [kind, setKind] = useState<LeaveKind>('holiday');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [rowBusy, setRowBusy] = useState<number | null>(null);

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

  const days = monthGrid(month);
  const weekdays = useMemo(() => daysBetween(ymd(starts), ymd(ends < starts ? starts : ends)), [starts, ends]);
  const spanLabel = weekdays === 1 ? '1 weekday' : `${weekdays} weekdays`;

  function pick(day: Date) {
    const date = startOfDay(day);

    if (!awaitingEnd) {
      setStarts(date);
      setEnds(date);
      setAwaitingEnd(true);
      return;
    }

    if (date < starts) {
      setEnds(starts);
      setStarts(date);
    } else {
      setEnds(date);
    }

    setAwaitingEnd(false);
  }

  function shiftMonth(by: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + by, 1));
  }

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

  async function cancel(row: Leave, ask: boolean) {
    setRowBusy(row.id);
    setMessage(null);

    try {
      const result = await api<{ result: string }>(`/mobile/leave/${row.id}/cancel`, {
        method: 'POST',
        body: ask ? { reason: cancelReason } : {},
      });
      setCancellingId(null);
      setCancelReason('');
      setMessage(
        result.result === 'requested'
          ? 'Cancellation sent. The holiday stays booked until the office approves it.'
          : row.status === 'pending'
            ? 'Holiday withdrawn.'
            : 'Holiday cancelled.',
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setRowBusy(null);
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
        <View style={styles.monthRow}>
          <Pressable hitSlop={8} onPress={() => shiftMonth(-1)}>
            <Text style={styles.monthStep}>‹</Text>
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.monthTitle}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
            <Text style={styles.span}>{spanLabel}</Text>
          </View>
          <Pressable hitSlop={8} onPress={() => shiftMonth(1)}>
            <Text style={styles.monthStep}>›</Text>
          </Pressable>
        </View>
        <View style={styles.week}>
          {WEEKDAYS.map((label) => (
            <Text key={label} style={styles.weekday}>
              {label}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {days.map((day) => {
            const inMonth = day.getMonth() === month.getMonth();
            const from = starts < ends ? starts : ends;
            const to = starts < ends ? ends : starts;
            const selected = sameDay(day, from) || sameDay(day, to);
            const inside = day > from && day < to;
            const weekend = day.getDay() === 0 || day.getDay() === 6;

            return (
              <Pressable key={ymd(day)} onPress={() => pick(day)} style={[styles.cell, inside ? styles.cellInside : null, selected ? styles.cellOn : null]}>
                <Text style={[styles.cellText, !inMonth ? styles.cellMuted : null, weekend && inMonth ? styles.cellWeekend : null, selected ? styles.cellOnText : null]}>
                  {day.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{awaitingEnd ? 'Tap the last day.' : 'Tap the first day, then the last.'}</Text>
        <TextInput
          onChangeText={setReason}
          placeholder="Reason"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={reason}
        />
        <Button disabled={busy} label={busy ? 'Sending…' : kind === 'sick' ? `Record ${spanLabel}` : `Request ${spanLabel}`} onPress={submit} />
      </Card>
      {message ? <Notice>{message}</Notice> : null}
      <Text style={styles.bookedTitle}>Booked</Text>
      {rows.length === 0 ? <Meta>No days booked yet.</Meta> : null}
      {rows.map((row) => {
        const booked = daysBetween(row.starts_on, row.ends_on);

        return (
          <View key={row.id} style={styles.booked}>
            <View style={styles.bookedRow}>
              <View style={styles.flex}>
                <Text numberOfLines={1} style={styles.bookedWhen}>
                  {prettyDate(row.starts_on)}
                  {row.starts_on === row.ends_on ? '' : ` – ${prettyDate(row.ends_on)}`}
                  {' · '}
                  {booked} day{booked === 1 ? '' : 's'}
                </Text>
                <Text numberOfLines={1} style={styles.bookedMeta}>
                  {kindLabel(row.kind)}
                  {row.reason ? ` · ${row.reason}` : ''}
                </Text>
              </View>
              <Pill label={statusLabel(row.status)} tone={statusTone(row.status)} />
            </View>
            {row.status === 'cancel_requested' ? <Meta>Stays booked until the office approves the cancellation.</Meta> : null}
            {row.status === 'pending' ? (
              <Button
                disabled={rowBusy === row.id}
                label={rowBusy === row.id ? 'Withdrawing…' : 'Withdraw'}
                onPress={() => cancel(row, false)}
                tone="ghost"
              />
            ) : null}
            {row.status === 'approved' && (row.kind ?? 'holiday') === 'holiday' && cancellingId !== row.id ? (
              <Button
                label="Ask to cancel"
                onPress={() => {
                  setCancellingId(row.id);
                  setCancelReason('');
                }}
                tone="ghost"
              />
            ) : null}
            {cancellingId === row.id ? (
              <View style={styles.cancelBox}>
                <TextInput
                  onChangeText={setCancelReason}
                  placeholder="Why should this holiday be cancelled?"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={cancelReason}
                />
                <Button
                  disabled={rowBusy === row.id}
                  label={rowBusy === row.id ? 'Sending…' : 'Send cancellation'}
                  onPress={() => cancel(row, true)}
                />
                <Button label="Keep holiday" onPress={() => setCancellingId(null)} tone="ghost" />
              </View>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 22, fontFamily: font.bold, color: colors.ink },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthTitle: { color: colors.ink, fontFamily: font.bold, fontSize: 16 },
  monthStep: { color: colors.ink, fontFamily: font.bold, fontSize: 28, paddingHorizontal: 6 },
  span: { color: colors.greenDark, fontFamily: font.bold, fontSize: 13 },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: colors.muted, fontFamily: font.medium, fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  cellInside: { backgroundColor: colors.greenSoft, borderRadius: 0 },
  cellOn: { backgroundColor: colors.accent, borderRadius: 20 },
  cellText: { color: colors.ink, fontFamily: font.semibold, fontSize: 14 },
  cellMuted: { color: colors.line },
  cellWeekend: { color: colors.muted },
  cellOnText: { color: '#fff' },
  hint: { color: colors.muted, fontFamily: font.regular, fontSize: 12 },
  bookedTitle: { color: colors.muted, fontFamily: font.bold, fontSize: 12, marginTop: 4 },
  booked: { gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  bookedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cancelBox: { gap: 8 },
  bookedWhen: { color: colors.ink, fontFamily: font.semibold, fontSize: 13 },
  bookedMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 12 },
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
