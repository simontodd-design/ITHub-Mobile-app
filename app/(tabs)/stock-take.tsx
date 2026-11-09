import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/api';
import { colors, font } from '@/theme';
import { BrandHeader, Button, Meta, Notice, Screen } from '@/ui';

type Location = { id: number; name: string };
type OpenTake = { id: number; location_id: number; location: string };
type Progress = {
  id: number;
  location: string;
  expected: number;
  scanned: number;
  unscanned: number;
  reserved: number;
  extras: string[];
  not_ready: string[];
};
type ScanResult = {
  message: string;
  serial: string;
  duplicate: boolean;
  reserved: boolean;
  progress: Progress;
};

export default function StockTakeScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [locations, setLocations] = useState<Location[]>([]);
  const [open, setOpen] = useState<OpenTake[]>([]);
  const [take, setTake] = useState<Progress | null>(null);
  const [message, setMessage] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const lastHit = useRef('');

  const load = useCallback(async () => {
    const result = await api<{ locations: Location[]; open: OpenTake[] }>('/mobile/stock-takes');
    setLocations(result.locations);
    setOpen(result.open);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch((error: Error) => {
        setMessage(error.message);
      });
    }, [load]),
  );

  async function start(locationId: number) {
    setBusy(true);
    try {
      const progress = await api<Progress>('/mobile/stock-takes', {
        method: 'POST',
        body: { stock_location_id: locationId },
      });
      setTake(progress);
      setMessage('');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start the stock take.');
    } finally {
      setBusy(false);
    }
  }

  async function join(id: number) {
    setBusy(true);
    try {
      setTake(await api<Progress>(`/mobile/stock-takes/${id}`));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open the stock take.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(value: string) {
    const trimmed = value.trim();
    if (!take || trimmed === '' || busy) {
      return;
    }

    setBusy(true);
    setCode('');
    try {
      const result = await api<ScanResult>(`/mobile/stock-takes/${take.id}/scan`, {
        method: 'POST',
        body: { code: trimmed },
      });
      setTake(result.progress);
      setMessage(`${result.serial}. ${result.message}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That scan was not counted.');
    } finally {
      setBusy(false);
    }
  }

  function onCamera(data: string) {
    const now = `${data}:${Math.floor(Date.now() / 1200)}`;
    if (lastHit.current === now) {
      return;
    }
    lastHit.current = now;
    submit(data);
  }

  return (
    <Screen scroll={false}>
      <BrandHeader eyebrow="Stock" title="Stock take" />
      {message ? <Notice>{message}</Notice> : null}
      {take ? (
        <View style={styles.panel}>
          {permission?.granted ? (
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
              onBarcodeScanned={({ data }) => onCamera(data)}
              style={styles.camera}
            />
          ) : (
            <Pressable onPress={requestPermission} style={styles.camera}>
              <Text style={styles.cameraText}>Allow the camera to scan</Text>
            </Pressable>
          )}
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.title}>{take.location}</Text>
            <Meta>
              {take.scanned} scanned · {take.unscanned} not scanned · {take.expected} expected
              {take.reserved ? ` · ${take.reserved} reserved` : ''}
            </Meta>
            {take.extras.length ? <Meta>Found extra: {take.extras.join(', ')}</Meta> : null}
            {take.not_ready.length ? <Meta>No serials yet: {take.not_ready.join(', ')}</Meta> : null}
            <TextInput
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => submit(code)}
              placeholder="Type a serial"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              style={styles.input}
            />
            <Button label="Add serial" onPress={() => submit(code)} disabled={busy} />
            <Button label="Done" onPress={() => router.back()} tone="ink" />
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.title}>Open counts</Text>
          {open.length === 0 ? <Meta>No stock take is open.</Meta> : null}
          {open.map((row) => (
            <Button key={row.id} label={`Continue ${row.location}`} onPress={() => join(row.id)} disabled={busy} />
          ))}
          <Text style={styles.title}>Start</Text>
          {locations.map((location) => (
            <Button key={location.id} label={location.name} onPress={() => start(location.id)} disabled={busy} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  camera: { height: 220, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  cameraText: { color: colors.paper, fontFamily: font.bold },
  body: { padding: 16, gap: 12 },
  title: { color: colors.ink, fontFamily: font.bold, fontSize: 18 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontFamily: font.regular,
  },
});
