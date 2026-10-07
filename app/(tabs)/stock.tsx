import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '@/api';
import { colors, font } from '@/theme';
import { BrandHeader, Button, Card, Meta, Notice, Screen } from '@/ui';

type Line = {
  id: number;
  product_id: number;
  product: string | null;
  barcode: string | null;
  is_serialised: boolean;
  outstanding: number;
  unit_cost: string;
  unit_sell: string;
};

type Order = {
  id: number;
  reference: string;
  supplier_reference: string | null;
  status_label: string;
  is_open: boolean;
  supplier: { name: string } | null;
  lines: Line[];
};

type Match = {
  matched: boolean;
  code: string;
  line: Line | null;
  lines: Line[];
  message: string | null;
};

type Added = { id: string; label: string; detail: string };

export default function StockScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [orders, setOrders] = useState<Order[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [code, setCode] = useState('');
  const [serial, setSerial] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [line, setLine] = useState<Line | null>(null);
  const [pendingCode, setPendingCode] = useState('');
  const [picking, setPicking] = useState(false);
  const [serialMode, setSerialMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Added[]>([]);
  const lastHit = useRef({ code: '', at: 0 });

  useEffect(() => {
    api<{ purchase_orders: Order[] }>('/mobile/stock/purchase-orders')
      .then((payload) => {
        setOrders(payload.purchase_orders);
        if (payload.purchase_orders.length === 1) {
          setOrder(payload.purchase_orders[0]);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403) {
          router.back();
        } else {
          setMessage(error instanceof ApiError ? error.message : 'Could not load purchase orders.');
        }
      });
  }, [router]);

  function resetUnit() {
    setCode('');
    setSerial('');
    setQuantity('1');
    setLine(null);
    setPendingCode('');
    setPicking(false);
    setSerialMode(false);
  }

  async function matchCode(raw: string) {
    const next = raw.trim();

    if (!order || !next || busy || line) {
      return;
    }

    const now = Date.now();

    if (lastHit.current.code === next && now - lastHit.current.at < 1200) {
      return;
    }

    lastHit.current = { code: next, at: now };
    setBusy(true);
    setMessage(null);

    try {
      const match = await api<Match>(`/mobile/stock/purchase-orders/${order.id}/match`, {
        method: 'POST',
        body: { code: next },
      });

      if (match.matched && match.line) {
        setLine(match.line);
        setPendingCode('');
        setPicking(false);
        setSerialMode(!!match.line.is_serialised);
      } else if (match.message) {
        setMessage(match.message);
        setPicking(false);
      } else {
        setPendingCode(next);
        setPicking(true);
        setLine(null);
      }

      setCode('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Could not match that barcode.');
    } finally {
      setBusy(false);
    }
  }

  function pickLine(next: Line) {
    if (next.barcode && pendingCode && next.barcode !== pendingCode) {
      setMessage(`${next.product} already has barcode ${next.barcode}. Scan that code.`);

      return;
    }

    setLine(next);
    setPicking(false);
    setMessage(null);
    setSerialMode(next.is_serialised);
  }

  function onCamera(data: string) {
    if (serialMode && line?.is_serialised) {
      setSerial(data);
      setSerialMode(false);

      return;
    }

    void matchCode(data);
  }

  async function generateSerial() {
    if (!line) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const payload = await api<{ serial: string }>('/mobile/stock/serials/generate', {
        method: 'POST',
        body: { product_id: line.product_id },
      });
      setSerial(payload.serial);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Could not generate a serial.');
    } finally {
      setBusy(false);
    }
  }

  async function receive() {
    if (!order || !line) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const updated = await api<Order>(`/mobile/stock/purchase-orders/${order.id}/receive`, {
        method: 'POST',
        body: {
          line_id: line.id,
          barcode: pendingCode || null,
          serial: line.is_serialised ? serial.trim() || null : null,
          quantity: line.is_serialised ? 1 : Math.max(1, Number.parseInt(quantity, 10) || 1),
          generate_serial: false,
        },
      });
      setAdded((current) => [
        {
          id: `${Date.now()}`,
          label: line.product ?? 'Received',
          detail: line.is_serialised ? serial.trim() || 'Serial generated' : `×${quantity}`,
        },
        ...current,
      ]);
      setOrder(updated);
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)).filter((item) => item.is_open));
      resetUnit();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Could not receive that unit.');
    } finally {
      setBusy(false);
    }
  }

  const waiting = order?.lines.filter((item) => item.outstanding > 0) ?? [];
  const scanning = !line || serialMode;

  if (!order) {
    return (
      <Screen scroll header={<BrandHeader eyebrow="Stock" title="Receive stock" />}>
        <Meta>Choose the purchase order this delivery belongs to, then scan each product.</Meta>
        {orders.length === 0 ? <Notice>No purchase orders are waiting. Raise one on the desk first.</Notice> : null}
        {orders.map((item) => (
          <Pressable key={item.id} onPress={() => setOrder(item)}>
            <Card>
              <Text style={styles.name}>{item.reference}</Text>
              <Meta>
                {item.supplier?.name ?? 'Supplier'}
                {item.supplier_reference ? ` · ${item.supplier_reference}` : ''}
                {' · '}
                {item.status_label}
              </Meta>
            </Card>
          </Pressable>
        ))}
      </Screen>
    );
  }

  return (
    <Screen scroll={false} header={<BrandHeader eyebrow="Stock" title={order.reference} />}>
      <View style={styles.column}>
        {scanning ? (
          permission?.granted ? (
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
              onBarcodeScanned={({ data }) => onCamera(data)}
              style={styles.camera}
            />
          ) : (
            <Pressable onPress={requestPermission} style={styles.camera}>
              <Text style={styles.cameraText}>Allow the camera to scan barcodes and serials</Text>
            </Pressable>
          )
        ) : null}
        <ScrollView contentContainerStyle={styles.panel} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => { setOrder(orders.length === 1 ? order : null); resetUnit(); }}>
            <Text style={styles.link}>{orders.length > 1 ? 'Change order' : order.supplier?.name ?? 'Open order'}</Text>
          </Pressable>
          {order.supplier_reference ? <Meta>Order reference {order.supplier_reference}</Meta> : null}
          <Meta>Scan the barcode. If it is not on this order, pick the product, then scan or type the serial.</Meta>
          {!line ? (
            <View style={styles.block}>
              <TextInput
                onChangeText={setCode}
                onSubmitEditing={() => matchCode(code)}
                placeholder="Or type a barcode"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={code}
              />
              <Button label="Look up" onPress={() => matchCode(code)} tone="ink" disabled={busy || !code.trim()} />
            </View>
          ) : null}
          {message ? <Notice>{message}</Notice> : null}
          {picking ? (
            <View style={styles.block}>
              <Text style={styles.name}>{pendingCode} is not on this order</Text>
              {waiting.map((item) => (
                <Pressable key={item.id} onPress={() => pickLine(item)}>
                  <Card>
                    <Text style={styles.name}>{item.product}</Text>
                    <Meta>{item.barcode ? `Barcode ${item.barcode}` : 'No barcode yet'} · {item.outstanding} waiting</Meta>
                  </Card>
                </Pressable>
              ))}
            </View>
          ) : null}
          {line ? (
            <Card accent={colors.green}>
              <Text style={styles.name}>{line.product}</Text>
              <Meta>
                {line.outstanding} waiting
                {pendingCode ? ` · barcode ${pendingCode} will be saved` : ''}
              </Meta>
              {line.is_serialised ? (
                <View style={styles.block}>
                  <TextInput
                    onChangeText={setSerial}
                    placeholder="Scan or type the serial"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    value={serial}
                  />
                  <Button label={serialMode ? 'Point the camera at the serial' : 'Scan serial'} onPress={() => setSerialMode(true)} tone="ink" />
                  <Button label="Generate a serial" onPress={generateSerial} tone="ink" disabled={busy} />
                </View>
              ) : (
                <TextInput keyboardType="number-pad" onChangeText={setQuantity} style={styles.input} value={quantity} />
              )}
              <Button label="Receive" onPress={receive} disabled={busy || (line.is_serialised && !serial.trim())} />
              <Button label="Cancel" onPress={resetUnit} tone="ghost" />
            </Card>
          ) : null}
          {added.length ? <Text style={styles.heading}>This delivery</Text> : null}
          {added.map((item) => (
            <Card key={item.id}>
              <Text style={styles.name}>{item.label}</Text>
              <Meta>{item.detail}</Meta>
            </Card>
          ))}
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  block: { gap: 12 },
  camera: { height: 220, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  cameraText: { color: '#fff', textAlign: 'center', paddingHorizontal: 24, fontFamily: font.medium },
  panel: { padding: 16, gap: 12, paddingBottom: 28 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.ink,
    fontFamily: font.regular,
  },
  name: { color: colors.ink, fontFamily: font.bold, fontSize: 16 },
  link: { color: colors.greenDark, fontFamily: font.bold },
  heading: { color: colors.ink, fontFamily: font.bold, fontSize: 16 },
});
