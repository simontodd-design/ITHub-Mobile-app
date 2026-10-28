import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '@/api';
import { clientId, enqueue } from '@/offline';
import { colors, font } from '@/theme';
import { BrandHeader, Meta, Notice, Screen } from '@/ui';

type Place = { name: string; quantity: number };

type Taken = {
  id: number;
  name: string | null;
  part_number?: string | null;
  barcode?: string | null;
  quantity: number;
  held?: boolean;
  is_serialised?: boolean;
  serial?: string | null;
  location?: string | null;
  places?: Place[];
};

type PendingSerial = { id: number; name: string };

type ScanResult = {
  needs_serial?: boolean;
  product?: { id?: number; name?: string };
  taken?: Taken[];
  remaining?: number;
};

type CatalogueProduct = {
  id: number;
  name: string;
  part_number: string | null;
  barcode: string | null;
  is_serialised: boolean;
  free: number;
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
  const router = useRouter();
  const params = useLocalSearchParams<{ ticket?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [ticketId, setTicketId] = useState(params.ticket ?? '');
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [todayIds, setTodayIds] = useState<number[]>([]);
  const [jobsReady, setJobsReady] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'out' | 'back'>('out');
  const [message, setMessage] = useState<string | null>(null);
  const [taken, setTaken] = useState<Taken[]>([]);
  const [pending, setPending] = useState<PendingSerial | null>(null);
  const [adding, setAdding] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [addingBusy, setAddingBusy] = useState(false);
  const lastHit = useRef({ code: '', at: 0 });
  const queue = useRef<string[]>([]);
  const pumping = useRef(false);
  const modeRef = useRef(mode);
  const ticketRef = useRef(ticketId);
  const pendingRef = useRef<PendingSerial | null>(null);
  const holdBarcode = useRef<string | null>(null);
  const holdUntil = useRef(0);
  const ticketSeen = useRef(ticketId);
  const routedTicket = useRef(params.ticket ?? '');
  modeRef.current = mode;
  ticketRef.current = ticketId;
  pendingRef.current = pending;

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

    setJobs([...byId.values()]);
    setTodayIds(scheduled.filter((id, index) => scheduled.indexOf(id) === index));
  }, []);

  useFocusEffect(
    useCallback(() => {
      const incoming = params.ticket ?? '';

      if (incoming && incoming !== routedTicket.current) {
        routedTicket.current = incoming;
        setTicketId(incoming);
        setMode('out');
        clearPending();
      }

      load()
        .catch((err: Error) => setMessage(err.message))
        .finally(() => setJobsReady(true));
    }, [load, params.ticket]),
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
  const waiting = taken.filter((line) => line.held);
  const scanned = taken.filter((line) => !line.held);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return jobs.filter((job) => {
      if (!needle) {
        return true;
      }

      return [String(job.id), job.subject, job.customer?.name, job.site?.name, job.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [jobs, query]);

  const sections = useMemo(() => {
    if (query.trim()) {
      return shown.length ? [{ title: 'Matches', data: shown }] : [];
    }

    const today = shown.filter((job) => todayIds.includes(job.id));
    const rest = shown.filter((job) => !todayIds.includes(job.id));
    const next: { title: string; data: JobOption[] }[] = [];

    if (today.length > 0) {
      next.push({ title: 'Today', data: today });
    }

    if (rest.length > 0) {
      next.push({ title: today.length > 0 ? 'Other jobs' : 'Open jobs', data: rest });
    }

    return next;
  }, [shown, query, todayIds]);

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

  function placeLabel(line: Taken): string | null {
    if (line.location) {
      return line.location;
    }

    const places = line.places ?? [];

    if (places.length === 0) {
      return null;
    }

    return places.map((place) => `${place.quantity} at ${place.name}`).join(' · ');
  }

  function scanHint(line: Taken): string {
    if (line.serial) {
      return `Scan serial ${line.serial}`;
    }

    if (line.is_serialised) {
      return line.quantity > 1 ? `Scan ${line.quantity} serials` : 'Scan a serial';
    }

    if (!line.barcode) {
      return 'Confirm it on the phone';
    }

    return 'Scan the barcode';
  }

  function needsConfirm(line: Taken): boolean {
    return !line.is_serialised && !line.serial && !line.barcode;
  }

  function choose(job: JobOption) {
    const id = String(job.id);
    routedTicket.current = id;
    setTicketId(id);
    setQuery('');
    setMessage(null);
    setMode('out');
    clearPending();
    router.setParams({ ticket: id });
  }

  function changeTicket() {
    routedTicket.current = '';
    setTicketId('');
    setQuery('');
    setMessage(null);
    setMode('out');
    closeCatalogue();
    clearPending();
    router.setParams({ ticket: '' });
  }

  function closeCatalogue() {
    setAdding(false);
    setProductQuery('');
    setProducts([]);
    setCatalogueError(null);
    setAddingBusy(false);
  }

  function openCatalogue() {
    setCatalogueError(null);
    setAdding(true);
  }

  useEffect(() => {
    if (!adding) {
      return;
    }

    const handle = setTimeout(() => {
      const needle = productQuery.trim();
      api<{ products: CatalogueProduct[] }>(`/mobile/products?q=${encodeURIComponent(needle)}`)
        .then((payload) => {
          setProducts(payload.products);
          setCatalogueError(null);
        })
        .catch((err: Error) => setCatalogueError(err.message));
    }, 200);

    return () => clearTimeout(handle);
  }, [adding, productQuery]);

  async function chooseProduct(product: CatalogueProduct) {
    if (addingBusy) {
      return;
    }

    if (product.is_serialised) {
      const next = { id: product.id, name: product.name };
      pendingRef.current = next;
      setPending(next);
      setMessage(`Scan the serial on ${product.name}.`);
      closeCatalogue();
      return;
    }

    if (product.barcode) {
      setCatalogueError('Scan the barcode on this part.');
      return;
    }

    const ticket = ticketRef.current;

    if (!ticket) {
      return;
    }

    setAddingBusy(true);
    setCatalogueError(null);

    try {
      const result = await api<ScanResult>(`/mobile/tickets/${ticket}/basket/add`, {
        method: 'POST',
        body: { product_id: product.id, quantity: 1 },
      });
      setTaken(result.taken ?? []);
      setMessage(`${product.name} is on this job.`);
      closeCatalogue();
    } catch (err) {
      setCatalogueError(err instanceof Error ? err.message : 'Could not add that part.');
    } finally {
      setAddingBusy(false);
    }
  }

  async function confirmLine(line: Taken, returning: boolean) {
    const ticket = ticketRef.current;

    if (!ticket || addingBusy) {
      return;
    }

    setAddingBusy(true);
    setMessage(null);

    try {
      const result = await api<ScanResult>(
        `/mobile/tickets/${ticket}/basket/${line.id}/${returning ? 'return' : 'issue'}`,
        { method: 'POST' },
      );
      const name = result.product?.name ?? line.name ?? 'Part';
      setTaken(result.taken ?? []);
      setMessage(returning ? `${name} is back in the store.` : `${name} is on this job.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update that part.');
    } finally {
      setAddingBusy(false);
    }
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
          const waitingSerial = pendingRef.current;
          const result = await api<ScanResult>(
            `/mobile/tickets/${ticket}/basket/${returning ? 'return' : 'scan'}`,
            {
              method: 'POST',
              body: waitingSerial
                ? { barcode: trimmed, product_id: waitingSerial.id }
                : { barcode: trimmed, quantity: 1 },
            },
          );

          if (result.needs_serial && result.product?.id) {
            const next = { id: result.product.id, name: result.product.name ?? 'this product' };
            holdBarcode.current = trimmed;
            holdUntil.current = 0;
            pendingRef.current = next;
            setPending(next);
            setMessage(returning ? `Scan the serial on ${next.name} to put it back.` : `Scan the serial on ${next.name}.`);
            if (result.taken) {
              setTaken(result.taken);
            }
            continue;
          }

          pauseHeldBarcode();
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
        } catch (err) {
          if (!returning && ticket && !(err instanceof ApiError && err.status >= 400 && err.status < 500)) {
            await enqueue({
              client_id: clientId('scan'),
              type: 'scan',
              ticket_id: Number(ticket),
              barcode: trimmed,
              quantity: 1,
            });
            setMessage('Saved on the phone. It will sync when the signal returns.');
          } else {
            setMessage(err instanceof Error ? err.message : 'Scan failed.');
          }
        }
      }
    } finally {
      pumping.current = false;
    }
  }

  const ticketTitle = selected?.subject ?? `Ticket #${ticketId}`;
  const ticketMeta = selected
    ? [`#${selected.id}`, selected.customer?.name, selected.site?.name].filter(Boolean).join(' · ')
    : 'Parts for this job';

  if (adding) {
    return (
      <Screen scroll={false} header={<BrandHeader eyebrow="Hardware" title="Scan" />}>
        <View style={styles.picker}>
          <View style={styles.catalogueHead}>
            <Text style={styles.lead}>Add a part</Text>
            <Pressable onPress={closeCatalogue}>
              <Text style={styles.change}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            autoFocus
            onChangeText={setProductQuery}
            placeholder="Search name, part number, or barcode"
            placeholderTextColor={colors.muted}
            style={styles.search}
            value={productQuery}
          />
          {catalogueError ? <View style={styles.catalogueNote}><Notice>{catalogueError}</Notice></View> : null}
          <FlatList
            data={products}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(product) => String(product.id)}
            contentContainerStyle={styles.pickerList}
            ListEmptyComponent={<Meta>{catalogueError ? ' ' : 'No parts match that search.'}</Meta>}
            renderItem={({ item }) => (
              <Pressable disabled={addingBusy} onPress={() => chooseProduct(item)} style={styles.row}>
                <View style={styles.copy}>
                  <Text numberOfLines={2} style={styles.rowSubject}>{item.name}</Text>
                  <Text numberOfLines={1} style={styles.ticketMeta}>
                    {item.part_number ?? 'No part number'}
                    {item.is_serialised ? ' · Scan the serial' : item.barcode ? ' · Scan the barcode' : item.free > 0 ? ` · ${item.free} in stock` : ''}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      </Screen>
    );
  }

  if (!ticketId) {
    return (
      <Screen scroll={false} header={<BrandHeader eyebrow="Hardware" title="Scan" />}>
        <View style={styles.picker}>
          <Text style={styles.lead}>Which job are these parts for?</Text>
          <TextInput
            autoFocus
            onChangeText={setQuery}
            placeholder="Search subject, customer, or number"
            placeholderTextColor={colors.muted}
            style={styles.search}
            value={query}
          />
          <SectionList
            sections={sections}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(job) => String(job.id)}
            contentContainerStyle={styles.pickerList}
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={
              <Meta>{jobsReady ? (jobs.length === 0 ? 'No open tickets to scan onto.' : 'Nothing matches that search.') : 'Loading jobs…'}</Meta>
            }
            renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
            renderItem={({ item }) => (
              <Pressable onPress={() => choose(item)} style={styles.row}>
                <View style={styles.copy}>
                  <Text numberOfLines={2} style={styles.rowSubject}>
                    {item.subject}
                  </Text>
                  <Text numberOfLines={1} style={styles.ticketMeta}>
                    #{item.id}
                    {item.customer?.name ? ` · ${item.customer.name}` : ''}
                    {item.site?.name ? ` · ${item.site.name}` : ''}
                  </Text>
                </View>
                {item.is_fast_tracked ? <View style={styles.dot} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} header={<BrandHeader eyebrow="Hardware" title="Scan" />}>
      <View style={styles.column}>
        {permission?.granted ? (
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'code39'] }}
            onBarcodeScanned={({ data }) => submit(data)}
            style={styles.camera}
          />
        ) : (
          <Pressable onPress={requestPermission} style={styles.camera}>
            <Text style={styles.cameraText}>Allow the camera to scan</Text>
          </Pressable>
        )}
        <View style={styles.frame} pointerEvents="none" />
        <ScrollView contentContainerStyle={styles.panel} keyboardShouldPersistTaps="handled">
          <Pressable onPress={changeTicket} style={styles.ticket}>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.ticketSubject}>
                {ticketTitle}
              </Text>
              <Text numberOfLines={1} style={styles.ticketMeta}>
                {ticketMeta}
              </Text>
            </View>
            <Text style={styles.change}>Change</Text>
          </Pressable>
          {message ? <Notice>{message}</Notice> : null}
          {pending ? (
            <View style={styles.serial}>
              <Text style={styles.serialText}>Scan the serial on {pending.name}</Text>
              <Pressable onPress={() => { clearPending(); setMessage(null); }}>
                <Text style={styles.change}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          {mode === 'out' ? (
            <>
              <Text style={styles.heading}>
                {waiting.length > 0 ? `Get these · ${waiting.length}` : taken.length > 0 ? 'Reserved parts are scanned' : 'Nothing reserved'}
              </Text>
              {waiting.length === 0 ? (
                <Meta>
                  {taken.length > 0
                    ? 'Scan any other barcode, or add a part that has no barcode.'
                    : 'Nothing is held for this job. Scan a barcode, or add a part that has no barcode.'}
                </Meta>
              ) : (
                <Meta>
                  {waiting.some(needsConfirm)
                    ? 'Confirm a part with no barcode. Scan the serial on anything that has one.'
                    : 'Scan each one. A part with no barcode can be added by hand.'}
                </Meta>
              )}
              {waiting.map((line, index) => {
                const where = placeLabel(line);

                return (
                  <View key={line.id} style={styles.pick}>
                    <Text style={styles.index}>{index + 1}</Text>
                    <View style={styles.copy}>
                      <View style={styles.taken}>
                        <Text numberOfLines={2} style={styles.product}>
                          {line.name ?? 'Part'}
                        </Text>
                        <Text style={styles.qty}>× {line.quantity}</Text>
                      </View>
                      {where ? <Text style={styles.where}>{where}</Text> : null}
                      <Text style={styles.pickMeta}>
                        {scanHint(line)}
                        {line.part_number ? ` · ${line.part_number}` : ''}
                      </Text>
                      {needsConfirm(line) ? (
                        <Pressable disabled={addingBusy} onPress={() => confirmLine(line, false)}>
                          <Text style={styles.change}>Scan out</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })}
              {scanned.length > 0 ? (
                <>
                  <Text style={styles.heading}>On this job</Text>
                  {scanned.map((line) => (
                    <View key={line.id} style={styles.done}>
                      <Text numberOfLines={1} style={styles.doneName}>
                        {line.name ?? 'Part'}
                      </Text>
                      <Text style={styles.qty}>× {line.quantity}</Text>
                    </View>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.serial}>
                <Text style={styles.serialText}>Putting a part back</Text>
                <Pressable onPress={() => { setMode('out'); clearPending(); setMessage(null); }}>
                  <Text style={styles.change}>Done</Text>
                </Pressable>
              </View>
              <Meta>
                {scanned.some(needsConfirm)
                  ? 'Confirm a part with no barcode to put it back. Scan the serial on anything that has one.'
                  : 'Scan the barcode, or the serial if it has one.'}
              </Meta>
              {scanned.length === 0 ? <Meta>Nothing on this job to put back.</Meta> : null}
              {scanned.map((line) => (
                <View key={line.id} style={styles.done}>
                  <Text numberOfLines={1} style={styles.doneName}>
                    {line.name ?? 'Part'}
                  </Text>
                  <Text style={styles.qty}>× {line.quantity}</Text>
                  {needsConfirm(line) ? (
                    <Pressable disabled={addingBusy} onPress={() => confirmLine(line, true)}>
                      <Text style={styles.change}>Put back</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </>
          )}
        </ScrollView>
        {mode === 'out' && !pending ? (
          <View style={styles.actions}>
            <Pressable onPress={openCatalogue} style={styles.action}>
              <Text style={styles.actionText}>Add manually</Text>
            </Pressable>
            <Pressable onPress={() => { setMode('back'); clearPending(); setMessage(null); }} style={styles.action}>
              <Text style={styles.actionText}>Put a part back</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  camera: { height: 168, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  cameraText: { color: '#fff', paddingHorizontal: 24, textAlign: 'center', fontFamily: font.medium },
  frame: {
    position: 'absolute',
    top: 28,
    alignSelf: 'center',
    width: '68%',
    height: 112,
    borderWidth: 2,
    borderColor: colors.green,
    borderRadius: 12,
  },
  panel: { padding: 16, gap: 10, paddingBottom: 28 },
  ticket: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.greenSoft,
    borderColor: colors.greenDark,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ticketSubject: { color: colors.ink, fontFamily: font.semibold, fontSize: 15 },
  ticketMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 13 },
  change: { color: colors.greenDark, fontFamily: font.bold, fontSize: 14 },
  picker: { flex: 1, backgroundColor: colors.paper, paddingTop: 8 },
  lead: { color: colors.ink, fontFamily: font.semibold, fontSize: 20, paddingHorizontal: 16, paddingBottom: 12 },
  search: {
    marginHorizontal: 16,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.ink,
    fontFamily: font.regular,
    fontSize: 16,
  },
  pickerList: { paddingBottom: 24, paddingTop: 8 },
  section: {
    color: colors.muted,
    fontFamily: font.bold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  copy: { flex: 1, gap: 2 },
  rowSubject: { color: colors.ink, fontFamily: font.semibold, fontSize: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  serial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  serialText: { flex: 1, color: colors.ink, fontFamily: font.semibold, fontSize: 14 },
  heading: { marginTop: 6, color: colors.ink, fontFamily: font.bold, fontSize: 16 },
  pick: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  index: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.greenSoft,
    color: colors.greenDark,
    fontFamily: font.bold,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 28,
    overflow: 'hidden',
  },
  pickMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 13 },
  where: { color: colors.greenDark, fontFamily: font.semibold, fontSize: 14 },
  taken: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  product: { color: colors.ink, fontFamily: font.bold, fontSize: 15, flex: 1 },
  qty: { color: colors.muted, fontFamily: font.semibold },
  done: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  doneName: { color: colors.ink, fontFamily: font.medium, fontSize: 14, flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: colors.paper,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionText: { color: colors.greenDark, fontFamily: font.bold, fontSize: 14 },
  catalogueHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingRight: 16,
  },
  catalogueNote: { paddingHorizontal: 16 },
});
