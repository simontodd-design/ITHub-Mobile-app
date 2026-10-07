import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import { api } from '@/api';
import { ago, elapsed, formatSeconds, mapsUrl } from '@/format';
import { clientId, enqueue } from '@/offline';
import { colors } from '@/theme';
import { NoteBody } from '@/Post';
import { font } from '@/theme';
import { BrandHeader, Button, Card, Meta, Notice, Pill, Screen, useNow } from '@/ui';

type Job = {
  id: number;
  subject: string;
  description: string | null;
  priority: string | number | null;
  is_fast_tracked: boolean;
  status: string | null;
  customer: { name: string } | null;
  account_hold: { reason: string | null } | null;
  phone: string | null;
  site: { name: string; address: string; latitude: string | null; longitude: string | null } | null;
  timer: { running: boolean; started_at: string | null; elapsed_seconds: number };
  notes: { id: number; body: string; created_at: string | null; type: string; author?: string | null }[];
  signature: { signer_name: string; signed_at: string } | null;
  visit_id: number | null;
};

export default function JobScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [note, setNote] = useState('');
  const [signer, setSigner] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [noteOpen, setNoteOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [postsOpen, setPostsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = useNow(Boolean(job?.timer.running));

  const load = useCallback(async () => {
    setJob(await api<Job>(`/mobile/tickets/${id}`));
  }, [id]);

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  }, [load]);

  async function refresh() {
    try {
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load the job.');
    }
  }

  async function timer() {
    if (!job) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      if (job.timer.running) {
        try {
          await api(`/mobile/tickets/${id}/timer/stop`, { method: 'POST' });
          setMessage('Time is on the timesheet.');
        } catch {
          await enqueue({ client_id: clientId('timer'), type: 'timer_stop', ticket_id: Number(id) });
          setMessage('Timer stop is queued until you have a signal.');
        }
      } else {
        await api(`/mobile/tickets/${id}/timer/start`, { method: 'POST' });
      }

      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Timer failed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (!note.trim()) {
      return;
    }

    try {
      await api(`/mobile/tickets/${id}/notes`, { method: 'POST', body: { body: note } });
      setMessage('Note sent to the office.');
    } catch {
      await enqueue({ client_id: clientId('note'), type: 'note', ticket_id: Number(id), body: note });
      setMessage('Note is queued until you have a signal.');
    }

    setNote('');
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
    setMessage('Photo attached to the job.');
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

  async function onSign(image: string) {
    const raw = image.replace(/^data:image\/png;base64,/, '');

    try {
      await api(`/mobile/tickets/${id}/sign-off`, {
        method: 'POST',
        body: { signer_name: signer || 'Customer', image: raw },
      });
      setMessage('Sign-off saved.');
    } catch {
      await enqueue({
        client_id: clientId('sign'),
        type: 'signature',
        ticket_id: Number(id),
        signer_name: signer || 'Customer',
        image: raw,
      });
      setMessage('Sign-off is queued until you have a signal.');
    }

    setSigning(false);
    await refresh();
  }

  function noteLabel(type: string): string {
    if (type === 'private') {
      return 'Private';
    }

    if (type === 'system') {
      return 'System';
    }

    return 'Customer';
  }

  const directions = mapsUrl(job?.site);
  const timerLabel = job?.timer.running ? elapsed(job.timer.started_at, now) : formatSeconds(job?.timer.elapsed_seconds ?? 0);

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
      onRefresh={refresh}
      header={
        <BrandHeader eyebrow={job.customer?.name ?? 'Job'} title={job.subject}>
          <Pressable hitSlop={8} onPress={() => router.back()}>
            <Text style={styles.back}>Back</Text>
          </Pressable>
        </BrandHeader>
      }
    >
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
        <View style={styles.links}>
          {job.phone ? (
            <Pressable onPress={() => Linking.openURL(`tel:${job.phone}`)}>
              <Text style={styles.link}>{job.phone}</Text>
            </Pressable>
          ) : null}
          {directions ? (
            <Pressable onPress={() => Linking.openURL(directions)}>
              <Text style={styles.link}>Directions</Text>
            </Pressable>
          ) : null}
        </View>
        <Button disabled={busy || Boolean(job.account_hold)} label={job.timer.running ? `Stop timer ${timerLabel}` : 'Start timer'} onPress={timer} tone={job.timer.running ? 'danger' : 'accent'} />
      </View>

      <View style={styles.tools}>
        <Pressable onPress={() => setPhotoOpen((open) => !open)} style={[styles.tool, photoOpen ? styles.toolOn : null]}>
          <Text style={styles.toolText}>Photo</Text>
        </Pressable>
        <Pressable onPress={() => router.push(`/scan?ticket=${id}`)} style={styles.tool}>
          <Text style={styles.toolText}>Parts</Text>
        </Pressable>
        <Pressable onPress={() => setNoteOpen((open) => !open)} style={styles.tool}>
          <Text style={styles.toolText}>Note</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setSignOpen((open) => !open);
            setSigning(false);
          }}
          style={styles.tool}
        >
          <Text style={styles.toolText}>{job.signature ? 'Signed' : 'Sign'}</Text>
        </Pressable>
      </View>

      {photoOpen ? (
        <View style={styles.panel}>
          {cameraPermission?.granted ? (
            <CameraView ref={cameraRef} style={styles.camera} />
          ) : (
            <Pressable onPress={requestCameraPermission} style={styles.camera}>
              <Text style={styles.cameraText}>Allow the camera to photograph this job</Text>
            </Pressable>
          )}
          <Button disabled={!cameraPermission?.granted} label="Capture" onPress={capture} />
          <Button label="Choose from library" onPress={chooseLibrary} tone="ink" />
        </View>
      ) : null}

      {message ? <Notice>{message}</Notice> : null}

      {noteOpen ? (
        <View style={styles.panel}>
          <TextInput
            multiline
            onChangeText={setNote}
            placeholder="What you did, what is left"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={note}
          />
          <Button label="Save note" onPress={saveNote} tone="ink" />
        </View>
      ) : null}

      {signOpen ? (
        <View style={styles.panel}>
          {job.signature ? <Meta>Signed by {job.signature.signer_name} · {ago(job.signature.signed_at)}</Meta> : null}
          <TextInput
            onChangeText={setSigner}
            placeholder="Name of person signing"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={signer}
          />
          {signing ? (
            <View style={styles.padSign}>
              <SignatureScreen descriptionText="Sign" onEmpty={() => setSigning(false)} onOK={onSign} />
            </View>
          ) : (
            <Button label="Sign" onPress={() => setSigning(true)} />
          )}
        </View>
      ) : null}

      {job.description ? (
        <View style={styles.panel}>
          <Text style={styles.kicker}>Request</Text>
          <NoteBody body={job.description} />
        </View>
      ) : null}

      <Text style={styles.kicker}>Progress</Text>
      {job.notes.length === 0 ? <Meta>No posts yet.</Meta> : null}
      {(postsOpen ? job.notes : job.notes.slice(0, 3)).map((row) => (
        <View key={row.id} style={styles.post}>
          <View style={styles.row}>
            <Text style={styles.postMeta}>
              {noteLabel(row.type)}
              {row.author ? ` · ${row.author}` : ''}
            </Text>
            <Text style={styles.when}>{ago(row.created_at)}</Text>
          </View>
          {row.type === 'system' ? <Text style={styles.system}>{row.body}</Text> : <NoteBody body={row.body} />}
        </View>
      ))}
      {job.notes.length > 3 ? (
        <Pressable onPress={() => setPostsOpen((open) => !open)}>
          <Text style={styles.link}>{postsOpen ? 'Show latest' : `Show ${job.notes.length - 3} earlier`}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, gap: 12 },
  back: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  summary: { gap: 8 },
  summaryMeta: { color: colors.muted, fontFamily: font.medium, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  links: { flexDirection: 'row', gap: 16 },
  link: { color: colors.greenDark, fontFamily: font.bold },
  tools: { flexDirection: 'row', gap: 8 },
  tool: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  toolOn: { borderColor: colors.greenDark, backgroundColor: colors.greenSoft },
  toolText: { color: colors.ink, fontFamily: font.bold, fontSize: 13 },
  panel: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 8 },
  kicker: { color: colors.ink, fontFamily: font.bold, fontSize: 13 },
  post: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 4 },
  postMeta: { color: colors.muted, fontFamily: font.semibold, fontSize: 12, flex: 1 },
  when: { color: colors.muted, fontFamily: font.medium, fontSize: 12 },
  system: { color: colors.ink, fontFamily: font.regular, fontSize: 14 },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    color: colors.ink,
    minHeight: 44,
  },
  padSign: { height: 180, borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: 'hidden' },
  camera: { height: 220, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  cameraText: { color: '#fff', textAlign: 'center', paddingHorizontal: 16, fontFamily: font.medium },
});
