import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api';
import { answerOfficePrompt } from '@/location';
import { ago } from '@/format';
import { registerPush } from '@/push';
import { colors, font } from '@/theme';
import { BrandHeader, Button, Card, Meta, Notice, Screen } from '@/ui';

type Alert = {
  id: number;
  message: string;
  severity: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: number | null;
  read_at: string | null;
  created_at: string | null;
};

function ticketId(alert: Alert): number | null {
  if (alert.entity_type === 'ticket' && alert.entity_id) {
    return alert.entity_id;
  }

  const match = alert.link?.match(/tickets\/(\d+)/);

  return match ? Number(match[1]) : null;
}

export default function AlertsScreen() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api<{ alerts: Alert[] }>('/mobile/alerts');
    setAlerts(result.alerts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch((err: Error) => setMessage(err.message));
    }, [load]),
  );

  async function enablePush() {
    try {
      setMessage(await registerPush());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Push could not be turned on.');
    }
  }

  function officeAction(alert: Alert): 'clock_in' | 'clock_out' | null {
    if (alert.entity_type !== 'office_clock' || alert.read_at) {
      return null;
    }

    return alert.link?.endsWith('clock_out') ? 'clock_out' : 'clock_in';
  }

  async function decide(alert: Alert, decision: 'confirm' | 'dismiss') {
    const action = officeAction(alert) ?? 'clock_in';
    setMessage(null);

    try {
      await answerOfficePrompt(decision, action);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not confirm.');
    }
  }

  async function open(alert: Alert) {
    if (alert.entity_type === 'office_clock') {
      return;
    }

    if (!alert.read_at) {
      await api(`/mobile/alerts/${alert.id}/read`, { method: 'POST' }).catch(() => undefined);
    }

    const id = ticketId(alert);

    if (id) {
      router.push(`/job/${id}`);
      return;
    }

    await load();
  }

  return (
    <Screen onRefresh={load} header={<BrandHeader eyebrow="While you are out" title="Alerts" />}>
      <Meta>Your jobs, clocking at the office, and your own leave.</Meta>
      <Pressable onPress={enablePush}>
        <Text style={styles.link}>Allow push while the app is closed</Text>
      </Pressable>
      {message ? <Notice>{message}</Notice> : null}
      {alerts.length === 0 ? <Meta>No alerts.</Meta> : null}
      {alerts.map((alert) => {
        const urgent = !alert.read_at && (alert.severity === 'urgent' || alert.severity === 'high');

        return (
          <Pressable key={alert.id} onPress={() => open(alert)}>
            <Card accent={urgent ? colors.warn : undefined}>
              <View style={styles.row}>
                <Text style={styles.title}>{alert.message}</Text>
                <Text style={styles.when}>{ago(alert.created_at)}</Text>
              </View>
              <Meta>{alert.read_at ? 'Read' : 'Unread'}</Meta>
              {officeAction(alert) ? (
                <View style={styles.row}>
                  <Button
                    label={officeAction(alert) === 'clock_out' ? 'Clock out' : 'Clock in'}
                    onPress={() => decide(alert, 'confirm')}
                    tone={officeAction(alert) === 'clock_out' ? 'danger' : 'accent'}
                  />
                  <Button label="Not now" onPress={() => decide(alert, 'dismiss')} tone="ghost" />
                </View>
              ) : null}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 22, fontFamily: font.bold, color: colors.ink },
  link: { color: colors.accent, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { color: colors.ink, fontWeight: '700', flex: 1 },
  when: { color: colors.muted, fontWeight: '700' },
});
