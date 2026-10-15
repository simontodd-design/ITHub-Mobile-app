import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/api';
import { callablePhone, chatWhen, mapsUrl } from '@/format';
import { clientId, enqueue } from '@/offline';
import { NoteBody } from '@/Post';
import { splitNote } from '@/noteBody';
import { colors, font } from '@/theme';
import { BrandHeader, Button, Meta, Notice, Pill, Screen } from '@/ui';

type Note = { id: number; body: string; created_at: string | null; type: string; author?: string | null };

type Part = {
  id: number;
  name: string | null;
  quantity: number;
  held?: boolean;
  serial?: string | null;
  location?: string | null;
};

type Job = {
  id: number;
  subject: string;
  description: string | null;
  is_fast_tracked: boolean;
  status: string | null;
  customer: { name: string } | null;
  account_hold: { reason: string | null } | null;
  phone: string | null;
  site: { name: string; address: string; latitude: string | null; longitude: string | null } | null;
  notes: Note[];
};

type ThreadItem = {
  key: string;
  body: string;
  who: string;
  when: string;
  staff: boolean;
  system: boolean;
  showWho: boolean;
};

export default function JobScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const listRef = useRef<FlatList<ThreadItem>>(null);

  const load = useCallback(async () => {
    const [next, basket] = await Promise.all([
      api<Job>(`/mobile/tickets/${id}`),
      api<{ lines: Part[] }>(`/mobile/tickets/${id}/basket`).catch(() => ({ lines: [] })),
    ]);
    setJob(next);
    setParts(basket.lines);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load().catch((err: Error) => setMessage(err.message));
    }, [load]),
  );

  async function refresh() {
    try {
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load the job.');
    }
  }

  async function send() {
    const body = draft.trim();

    if (!body || sending) {
      return;
    }

    setSending(true);
    setMessage(null);

    try {
      await api(`/mobile/tickets/${id}/notes`, { method: 'POST', body: { body } });
    } catch {
      await enqueue({ client_id: clientId('note'), type: 'note', ticket_id: Number(id), body });
      setMessage('Message is queued until you have a signal.');
    }

    setDraft('');
    setSending(false);
    await refresh();
  }

  async function attachPhoto(uri: string, type: string) {
    const form = new FormData();
    form.append('photo', {
      uri,
      name: 'job.jpg',
      type,
    } as unknown as Blob);

    await api(`/mobile/tickets/${id}/photos`, { method: 'POST', form });
    setPhotoOpen(false);
    setMessage('Photo added to the thread.');
    await refresh();
  }

  async function capture() {
    setMessage(null);

    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 0.6 });

      if (!picture?.uri) {
        setMessage('Could not take that photo.');
        return;
      }

      await attachPhoto(picture.uri, 'image/jpeg');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not take that photo.');
    }
  }

  async function chooseLibrary() {
    setMessage(null);

    try {
      const shot = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });

      if (shot.canceled || !shot.assets[0]) {
        return;
      }

      await attachPhoto(shot.assets[0].uri, shot.assets[0].mimeType ?? 'image/jpeg');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not open your photos.');
    }
  }

  const directions = mapsUrl(job?.site);
  const phone = callablePhone(job?.phone);
  const waiting = parts.filter((part) => part.held !== false).length;
  const thread = threadItems(job);

  if (!job) {
    return (
      <Screen scroll={false} header={<BrandHeader eyebrow="Job" title={`#${id}`} />}>
        <View style={styles.pad}>
          <Button label="Back" onPress={() => router.back()} tone="ghost" />
          {message ? <Notice>{message}</Notice> : <Meta>Loading job {id}…</Meta>}
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scroll={false}
      header={
        <BrandHeader eyebrow={job.customer?.name ?? 'Job'} title={job.subject}>
          {phone ? (
            <Pressable
              accessibilityLabel={`Call ${phone}`}
              hitSlop={8}
              onPress={() => Linking.openURL(`tel:${phone}`)}
              style={styles.call}
            >
              <Ionicons color="#fff" name="call" size={18} />
            </Pressable>
          ) : null}
          <Pressable hitSlop={8} onPress={() => router.back()}>
            <Text style={styles.back}>Back</Text>
          </Pressable>
        </BrandHeader>
      }
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.column}>
        <View style={styles.summary}>
          {job.account_hold ? (
            <Notice>
              Account on hold. Support cannot work this job
              {job.account_hold.reason ? ` · ${job.account_hold.reason}` : ''}.
            </Notice>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.summaryMeta}>
              {job.status ?? 'Open'}
              {job.site?.name ? ` · ${job.site.name}` : ''}
            </Text>
            {job.is_fast_tracked ? <Pill label="Fast Track" tone="accent" /> : null}
          </View>
          {directions ? (
            <View style={styles.links}>
              <Pressable onPress={() => Linking.openURL(directions)}>
                <Text style={styles.link}>Directions</Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable onPress={() => router.push(`/scan?ticket=${id}`)} style={styles.parts}>
            <View style={styles.row}>
              <Text style={styles.partsTitle}>{waiting ? `${waiting} to scan` : parts.length ? 'Parts on this job' : 'Parts'}</Text>
              <Text style={styles.partsLink}>Scan</Text>
            </View>
            {parts.length === 0 ? <Text style={styles.partEmpty}>Nothing held yet. Scan a part onto this job.</Text> : null}
            {parts.slice(0, 3).map((part) => (
              <Text key={part.id} numberOfLines={1} style={styles.partLine}>
                {part.held === false ? 'On the job · ' : ''}
                {part.quantity > 1 ? `${part.quantity} × ` : ''}
                {part.name || 'Part'}
                {part.location ? ` · ${part.location}` : ''}
              </Text>
            ))}
            {parts.length > 3 ? <Text style={styles.partMore}>{parts.length - 3} more</Text> : null}
          </Pressable>
          {message ? <Notice>{message}</Notice> : null}
        </View>
        <FlatList
          ref={listRef}
          inverted
          style={styles.list}
          data={[...thread].reverse()}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.thread}
          ListEmptyComponent={<Meta>No messages yet. Anything you send stays with staff.</Meta>}
          renderItem={({ item }) => {
            if (item.system) {
              return <Text style={styles.system}>{item.body}</Text>;
            }

            return (
              <View style={[styles.bubble, item.staff ? styles.staff : styles.customer]}>
                {item.showWho ? <Text style={styles.who}>{item.who}</Text> : null}
                <NoteBody body={item.body} />
                {item.when ? <Text style={styles.when}>{item.when}</Text> : null}
              </View>
            );
          }}
        />
        {photoOpen ? (
          <View style={styles.panel}>
            {cameraPermission?.granted ? (
              <CameraView ref={cameraRef} style={styles.camera} />
            ) : (
              <Pressable onPress={requestCameraPermission} style={styles.camera}>
                <Text style={styles.cameraText}>Allow the camera to photograph this job</Text>
              </Pressable>
            )}
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button disabled={!cameraPermission?.granted} label="Capture" onPress={capture} />
              </View>
              <View style={styles.flex}>
                <Button label="Library" onPress={chooseLibrary} tone="ink" />
              </View>
            </View>
          </View>
        ) : null}
        <View style={styles.composer}>
          <Pressable hitSlop={8} onPress={() => setPhotoOpen((open) => !open)} style={styles.cameraButton}>
            <Ionicons color={photoOpen ? colors.greenDark : colors.muted} name={photoOpen ? 'close' : 'camera-outline'} size={22} />
          </Pressable>
          <TextInput
            multiline
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft}
          />
          <Pressable disabled={sending || !draft.trim()} onPress={send} style={[styles.send, !draft.trim() ? styles.sendOff : null]}>
            <Ionicons color="#fff" name="send" size={16} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function sameWords(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const a = normalize(left);
  const b = normalize(right);

  return a !== '' && a === b;
}

function threadItems(job: Job | null): ThreadItem[] {
  if (!job) {
    return [];
  }

  const items: ThreadItem[] = [];
  const description = (job.description ?? '').trim();
  const request = splitNote(description);

  if (request.preview) {
    items.push({
      key: 'request',
      body: description,
      who: 'Request',
      when: '',
      staff: false,
      system: false,
      showWho: true,
    });
  }

  let previous = '';

  const notes = [...job.notes].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));

  for (const note of notes) {
    if (note.type === 'system' || (note.body ?? '').trim() === 'Attachments from inbound email') {
      continue;
    }

    if (note.type === 'customer' && !note.author && sameWords(note.body, description)) {
      continue;
    }

    if (!splitNote(note.body).preview) {
      continue;
    }

    const staff = note.type !== 'customer';
    const who = note.author ?? (staff ? 'Staff' : 'Customer');
    const showWho = who !== previous;

    items.push({
      key: String(note.id),
      body: note.body,
      who,
      when: chatWhen(note.created_at),
      staff,
      system: false,
      showWho,
    });
    previous = who;
  }

  return items;
}

const styles = StyleSheet.create({
  pad: { padding: 16, gap: 12 },
  column: { flex: 1 },
  flex: { flex: 1 },
  back: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  call: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  summary: { paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  summaryMeta: { color: colors.muted, fontFamily: font.medium, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  links: { flexDirection: 'row', gap: 16 },
  link: { color: colors.greenDark, fontFamily: font.bold },
  parts: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  partsTitle: { flex: 1, color: colors.ink, fontFamily: font.bold, fontSize: 14 },
  partsLink: { color: colors.greenDark, fontFamily: font.bold, fontSize: 14 },
  partLine: { color: colors.ink, fontFamily: font.regular, fontSize: 13 },
  partEmpty: { color: colors.muted, fontFamily: font.regular, fontSize: 13 },
  partMore: { color: colors.muted, fontFamily: font.medium, fontSize: 12 },
  list: { flex: 1 },
  panel: { backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, padding: 12, gap: 8 },
  thread: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 4 },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4, gap: 2 },
  staff: { alignSelf: 'flex-end', backgroundColor: colors.greenSoft, borderBottomRightRadius: 4 },
  customer: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 4 },
  who: { color: colors.ink, fontFamily: font.semibold, fontSize: 12 },
  when: { alignSelf: 'flex-end', color: colors.muted, fontFamily: font.medium, fontSize: 10, marginTop: 1 },
  system: { alignSelf: 'center', color: colors.muted, fontFamily: font.medium, fontSize: 12, textAlign: 'center', marginVertical: 6, paddingHorizontal: 16 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
  },
  cameraButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: colors.ink,
    fontFamily: font.regular,
    fontSize: 15,
  },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  camera: { height: 160, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  cameraText: { color: '#fff', textAlign: 'center', paddingHorizontal: 16, fontFamily: font.medium },
});
