import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '@/api';
import { clientId, enqueue } from '@/offline';
import { colors, font } from '@/theme';
import { BrandHeader, Meta, Notice, Screen } from '@/ui';

type Taken = { id: number; name: string | null; quantity: number; held?: boolean };

type PendingSerial = { id: number; name: string };

type ScanResult = {
  needs_serial?: boolean;
  product?: { id?: number; name?: string };
  taken?: Taken[];
  remaining?: number;
};

type JobOption = {
  id: number;
  subject: string;
  is_fast_tracked?: boolean;
  status?: string | null;
  customer?: { name: string } | null;
  site?: { name: string } | null;
};

export default function ScanScreen() {
  const params = useLocalSearchParams<{ ticket?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [ticketId, setTicketId] = useState(params.ticket ?? '');
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [todayIds, setTodayIds] = useState<number[]>([]);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'out' | 'back'>('out');
  const [message, setMessage] = useState<string | null>(null);
  const [taken, setTaken] = useState<Taken[]>([]);
  const [quantity, setQuantity] = useState('1');
  const [pending, setPending] = useState<PendingSerial | null>(null);
  const lastHit = useRef({ code: '', at: 0 });
  const queue = useRef<string[]>([]);
  const pumping = useRef(false);
  const modeRef = useRef(mode);
  const ticketRef = useRef(ticketId);
  const pendingRef = useRef<PendingSerial | null>(null);
  const quantityRef = useRef('1');
  const holdBarcode = useRef<string | null>(null);
  const holdUntil = useRef(0);
  const ticketSeen = useRef(ticketId);
  modeRef.current = mode;
  ticketRef.current = ticketId;
  pendingRef.current = pending;
  quantityRef.current = quantity;

  const loadTaken = useCallback(async (id: string) => {
    if (!id) {
      setTaken([]);
      return;
    }

    const payload = await api<{ lines: Taken[] }>(`/mobile/tickets/${id}/basket`);
    setTaken(payload.lines);
  }, []);

  const load = useCallback(async () => {
    const today = await api<{ tickets: JobOption[]; visits: { ticket_id: number | null; ticket: JobOption | null }[] }>('/mobile/jobs/today');

    const byId = new Map<number, JobOption>();

    for (const ticket of today.tickets) {
      byId.set(ticket.id, ticket);
    }

    const scheduled = today.visits.flatMap((visit) => (visit.ticket ? [visit.ticket.id] : []));

    for (const visit of today.visits) {
      if (visit.ticket && !byId.has(visit.ticket.id)) {
        byId.set(visit.ticket.id, visit.ticket);
      }
    }

    const unique = [...byId.values()];
    setJobs(unique);
    setTodayIds(scheduled.filter((id, index) => scheduled.indexOf(id) === index));
    setTicketId((current) => current || (unique.length === 1 ? String(unique[0].id) : ''));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (params.ticket) {
        setTicketId(params.ticket);
        setMode('out');
      }

      load().catch((err: Error) => setMessage(err.message));
      if (params.ticket) {
        loadTaken(params.ticket).catch(() => undefined);
      }
    }, [load, loadTaken, params.ticket]),
  );

  useEffect(() => {
    if (ticketSeen.current !== ticketId) {
      ticketSeen.current = ticketId;
      clearPending();
      setMessage(null);
    }

    if (!ticketId) {
      setTaken([]);
      return;
    }

    loadTaken(ticketId).catch(() => undefined);
  }, [ticketId, loadTaken]);

  const selected = jobs.find((job) => String(job.id) === ticketId) ?? null;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = jobs.filter((job) => {
      if (!needle) {
        return true;
      }

      return [String(job.id), job.subject, job.customer?.name, job.site?.name, job.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });

    if (needle) {
      return matches;
    }

    return [...matches].sort((a, b) => Number(todayIds.includes(b.id)) - Number(todayIds.includes(a.id)));
  }, [jobs, query, todayIds]);

  function heldBack(code: string) {
    return holdBarcode.current === code && (pendingRef.current !== null || Date.now() < holdUntil.current);
  }

  function clearPending() {
    pendingRef.current = null;
    setPending(null);
    holdBarcode.current = null;
    holdUntil.current = 0;
  }

  function pauseHeldBarcode() {
    if (holdBarcode.current) {
      holdUntil.current = Date.now() + 2500;
    }

    pendingRef.current = null;
    setPending(null);
  }

  function choose(job: JobOption) {
    setTicketId(String(job.id));
    setPicking(false);
    setQuery('');
    setMessage(null);
    clearPending();
  }

  function submit(value: string) {
    const trimmed = value.trim();
    const now = Date.now();

    if (!trimmed || heldBack(trimmed)) {
      return;
    }

    if (lastHit.current.code === trimmed && now - lastHit.current.at < 800) {
      return;
    }

    lastHit.current = { code: trimmed, at: now };

    if (!ticketRef.current) {
      setMessage('Choose the job first.');
      return;
    }

    queue.current.push(trimmed);
    void pump();
  }

  async function pump() {
    if (pumping.current) {
      return;
    }

    pumping.current = true;

    try {
      while (queue.current.length > 0) {
        const trimmed = queue.current.shift() ?? '';
        const ticket = ticketRef.current;
        const returning = modeRef.current === 'back';

        if (!trimmed || !ticket || heldBack(trimmed)) {
          continue;
        }

        try {
          const waiting = pendingRef.current;
          const amount = Math.max(1, Number.parseInt(quantityRef.current, 10) || 1);
          const result = await api<ScanResult>(
            `/mobile/tickets/${ticket}/basket/${returning ? 'return' : 'scan'}`,
            {
              method: 'POST',
              body: waiting
                ? { barcode: trimmed, product_id: waiting.id }
                : { barcode: trimmed, quantity: returning ? 1 : amount },
            },
          );

          if (result.needs_serial && result.product?.id) {
            const next = { id: result.product.id, name: result.product.name ?? 'this product' };
            holdBarcode.current = trimmed;
            holdUntil.current = 0;
            pendingRef.current = next;
            setPending(next);
            setMessage(returning ? `Scan the serial on ${next.name} to put it back.` : `Scan the serial on ${next.name}.`);
            setCode('');
            if (result.taken) {
              setTaken(result.taken);
            }
            continue;
          }

          pauseHeldBarcode();
          if (!returning) {
            quantityRef.current = '1';
            setQuantity('1');
          }
          const name = result.product?.name ?? trimmed;
          const left = result.remaining ?? 0;
          setTaken(result.taken ?? []);
          setMessage(
            returning
              ? left > 0
                ? `${name}: 1 back in Ithub Store. ${left} still on this job.`
                : `${name} is back in Ithub Store.`
              : `${name} is on this job.`,
          );
          setCode('');
        } catch (err) {
          if (!returning && ticket && !(err instanceof ApiError && err.status >= 400 && err.status < 500)) {
            await enqueue({
              client_id: clientId('scan'),
              type: 'scan',
              ticket_id: Number(ticket),
              barcode: trimmed,
              quantity: Math.max(1, Number.parseInt(quantityRef.current, 10) || 1),
            });
            setMessage('Saved on the phone. It will sync when the signal returns.');
            setCode('');
          } else {
            setMessage(err instanceof Error ? err.message : 'Scan failed.');
          }
        }
      }
    } finally {
      pumping.current = false;
    }
  }

  return (
    <Screen scroll={false} header={<BrandHeader eyebrow="Hardware" title="Scan" />}>
      <View style={styles.column}>
        {permission?.granted ? (
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'code39'] }}
            onBarcodeScanned={picking ? undefined : ({ data }) => submit(data)}
            style={styles.camera}
          />
        ) : (
          <Pressable onPress={requestPermission} style={styles.camera}>
            <Text style={styles.cameraText}>Allow the camera to scan a barcode or QR</Text>
          </Pressable>
        )}
        <View style={styles.frame} pointerEvents="none" />
        <ScrollView contentContainerStyle={styles.panel}>
          <View style={styles.modes}>
            <Pressable onPress={() => { setMode('out'); clearPending(); }} style={[styles.mode, mode === 'out' ? styles.modeOn : null]}>
              <Text style={mode === 'out' ? styles.modeOnText : styles.modeText}>Take for job</Text>
            </Pressable>
            <Pressable onPress={() => { setMode('back'); clearPending(); }} style={[styles.mode, mode === 'back' ? styles.modeOn : null]}>
              <Text style={mode === 'back' ? styles.modeOnText : styles.modeText}>Back to store</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setPicking(true)} style={[styles.ticket, selected ? styles.ticketOn : null]}>
              {selected ? (
                <>
                  <View style={styles.ticketTop}>
                    <Text numberOfLines={1} style={styles.ticketSubject}>
                      {selected.subject}
                    </Text>
                    <Text style={styles.change}>Change</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.ticketMeta}>
                    #{selected.id}
                    {selected.customer?.name ? ` · ${selected.customer.name}` : ''}
                    {selected.site?.name ? ` · ${selected.site.name}` : ''}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.ticketSubject}>{ticketId ? `Ticket #${ticketId}` : 'Choose a ticket'}</Text>
                  <Text style={styles.ticketMeta}>
                    {jobs.length === 0 ? 'No open tickets to scan onto.' : 'Search by subject, customer, or number.'}
                  </Text>
                </>
              )}
          </Pressable>
          <Meta>
            {pending
              ? `Point the camera at the serial on ${pending.name}. The barcode is not enough.`
              : mode === 'out'
                ? 'Serialised parts: scan the serial. Other parts: scan the barcode.'
                : 'Put one back. Serialised parts: scan the serial. Other parts: scan the barcode.'}
          </Meta>
          {pending ? (
            <Pressable onPress={() => { clearPending(); setMessage(null); }}>
              <Text style={styles.typeText}>Scan a barcode instead</Text>
            </Pressable>
          ) : null}
          {mode === 'out' && !pending ? (
            <View style={styles.qtyRow}>
              <Text style={styles.qtyLabel}>Quantity</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={(value) => {
                  quantityRef.current = value;
                  setQuantity(value);
                }}
                style={styles.qtyInput}
                value={quantity}
              />
            </View>
          ) : null}
          <TextInput
            onChangeText={setCode}
            onSubmitEditing={() => submit(code)}
            placeholder="Or type the code"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={code}
          />
          <Pressable onPress={() => submit(code)} style={styles.type}>
            <Text style={styles.typeText}>Use typed code</Text>
          </Pressable>
          {message ? <Notice>{message}</Notice> : null}
          <Text style={styles.heading}>Held for this job</Text>
          {taken.some((line) => line.held) ? null : <Meta>Nothing held. The office can hold parts before the visit.</Meta>}
          {taken.filter((line) => line.held).map((line) => (
            <View key={line.id} style={styles.taken}>
              <Text numberOfLines={1} style={styles.product}>
                {line.name ?? 'Part'}
              </Text>
              <Text style={styles.qty}>× {line.quantity}</Text>
            </View>
          ))}
          <Text style={styles.heading}>Scanned out</Text>
          {taken.some((line) => !line.held) ? null : <Meta>Nothing scanned out yet. Scan a serial to send a held part out.</Meta>}
          {taken.filter((line) => !line.held).map((line) => (
            <View key={line.id} style={styles.taken}>
              <Text numberOfLines={1} style={styles.product}>
                {line.name ?? 'Part'}
              </Text>
              <Text style={styles.qty}>× {line.quantity}</Text>
            </View>
          ))}
        </ScrollView>
        <Modal animationType="slide" onRequestClose={() => setPicking(false)} visible={picking}>
          <View style={styles.picker}>
            <View style={styles.pickerHead}>
              <Text style={styles.pickerTitle}>Choose a ticket</Text>
              <Pressable onPress={() => setPicking(false)}>
                <Text style={styles.change}>Close</Text>
              </Pressable>
            </View>
            <TextInput
              autoFocus
              onChangeText={setQuery}
              placeholder="Search subject, customer, or number"
              placeholderTextColor={colors.muted}
              style={styles.search}
              value={query}
            />
            <Text style={styles.count}>
              {shown.length} of {jobs.length}
            </Text>
            <FlatList
              data={shown}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(job) => String(job.id)}
              contentContainerStyle={styles.pickerList}
              ListEmptyComponent={<Meta>{jobs.length === 0 ? 'No open tickets to scan onto.' : 'Nothing matches that search.'}</Meta>}
              renderItem={({ item }) => (
                <Pressable onPress={() => choose(item)} style={styles.row}>
                  <View style={styles.copy}>
                    <Text numberOfLines={1} style={styles.rowSubject}>
                      {item.subject}
                    </Text>
                    <Text numberOfLines={1} style={styles.ticketMeta}>
                      #{item.id}
                      {item.customer?.name ? ` · ${item.customer.name}` : ''}
                      {item.site?.name ? ` · ${item.site.name}` : ''}
                      {!query.trim() && todayIds.includes(item.id) ? ' · Today' : ''}
                    </Text>
                  </View>
                  {item.is_fast_tracked ? <View style={styles.dot} /> : null}
                </Pressable>
              )}
            />
          </View>
        </Modal>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  camera: { height: 220, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  cameraText: { color: '#fff', paddingHorizontal: 24, textAlign: 'center' },
  frame: {
    position: 'absolute',
    top: 36,
    alignSelf: 'center',
    width: '70%',
    height: 148,
    borderWidth: 2,
    borderColor: colors.green,
    borderRadius: 12,
  },
  panel: { padding: 16, gap: 10, paddingBottom: 28 },
  modes: { flexDirection: 'row', gap: 8 },
  mode: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  modeOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeText: { color: colors.ink, fontWeight: '700' },
  modeOnText: { color: '#fff', fontWeight: '700' },
  ticket: { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  ticketOn: { borderColor: colors.greenDark, backgroundColor: colors.greenSoft },
  ticketTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ticketSubject: { flex: 1, color: colors.ink, fontFamily: font.semibold, fontSize: 15 },
  ticketMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 13 },
  change: { color: colors.greenDark, fontFamily: font.bold, fontSize: 14 },
  picker: { flex: 1, backgroundColor: colors.paper, paddingTop: 48 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  pickerTitle: { color: colors.ink, fontFamily: font.semibold, fontSize: 18 },
  search: {
    marginHorizontal: 16,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontFamily: font.regular,
  },
  count: { color: colors.muted, fontFamily: font.medium, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  pickerList: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  copy: { flex: 1, gap: 2 },
  rowSubject: { color: colors.ink, fontFamily: font.semibold, fontSize: 15 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  input: { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 12, color: colors.ink },
  type: { alignSelf: 'flex-start' },
  typeText: { color: colors.accent, fontWeight: '700' },
  heading: { marginTop: 8, fontWeight: '800', color: colors.ink },
  taken: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  product: { color: colors.ink, fontWeight: '700', flex: 1 },
  qty: { color: colors.muted, fontFamily: font.semibold },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyLabel: { color: colors.ink, fontFamily: font.semibold, fontSize: 14 },
  qtyInput: {
    width: 72,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: colors.ink,
    fontFamily: font.semibold,
    textAlign: 'center',
  },
});
