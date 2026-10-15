import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '@/api';
import { hoursLabel } from '@/format';
import { startOfficeWatch, startShiftTracking, stopShiftTracking } from '@/location';
import { flushQueue, queueCount } from '@/offline';
import { loadForcedOffline, setForcedOffline } from '@/reach';
import { clearToken } from '@/session';
import { WeekRing } from '@/art';
import { colors, font } from '@/theme';
import { BrandHeader, Button, Card, Meta, Screen } from '@/ui';

type Me = {
  name: string;
  email: string;
  role_name: string | null;
  role: string | null;
  clocked_in: boolean;
  location_on: boolean;
  week_minutes: number;
  week_jobs: number;
  callout: { phase: string } | null;
  can_manage_stock?: boolean;
};

export default function MeScreen() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [queued, setQueued] = useState(0);
  const [forced, setForced] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [locationAllowed, setLocationAllowed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const profile = await api<Me>('/mobile/me');
    setMe(profile);
    setQueued(await queueCount());
    setForced(await loadForcedOffline());
    const net = await NetInfo.fetch();
    setDisconnected(net.isConnected === false);
    const permission = await Location.getForegroundPermissionsAsync();
    setLocationAllowed(permission.status === 'granted');

    if (permission.status === 'granted') {
      if (profile.clocked_in) {
        startShiftTracking().catch(() => undefined);
      } else {
        startOfficeWatch().catch(() => undefined);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  async function toggleOffline(value: boolean) {
    await setForcedOffline(value);
    setForced(value);

    if (!value) {
      await flushQueue().catch(() => undefined);
      setQueued(await queueCount());
    }
  }

  async function allowLocation() {
    const current = await Location.getForegroundPermissionsAsync();

    if (current.status === 'denied' && current.canAskAgain === false) {
      await Linking.openSettings();

      return;
    }

    const next = await Location.requestForegroundPermissionsAsync();
    setLocationAllowed(next.status === 'granted');

    if (next.status !== 'granted') {
      return;
    }

    if (me?.clocked_in) {
      await startShiftTracking().catch(() => undefined);
    } else {
      await startOfficeWatch().catch(() => undefined);
    }
  }

  async function signOut() {
    await stopShiftTracking().catch(() => undefined);
    await api('/mobile/logout', { method: 'POST' }).catch(() => undefined);
    await clearToken();
    router.replace('/login');
  }

  const jobs = me?.week_jobs ?? 0;

  const first = me?.name?.split(' ')[0] ?? '…';

  return (
    <Screen
      onRefresh={load}
      header={<BrandHeader eyebrow={me?.role_name ?? me?.role ?? 'Field engineer'} title={first} />}
    >
      <Meta>{me?.email}</Meta>
      <Card>
        <View style={styles.row}>
          <WeekRing minutes={me?.week_minutes ?? 0} />
          <View style={styles.flex}>
            <Text style={styles.line}>This week</Text>
            <Meta>
              {hoursLabel(me?.week_minutes ?? 0)}h logged · {jobs} job{jobs === 1 ? '' : 's'}
            </Meta>
          </View>
        </View>
      </Card>
      <Card>
        <Text style={styles.line}>Callout mode</Text>
        <Meta>{me?.callout ? `On — ${me.callout.phase === 'on_site' ? 'on site' : 'travel'} timer running` : 'Travel, then on site, when you start a callout'}</Meta>
      </Card>
      <Card>
        <Text style={styles.line}>
          {locationAllowed === false
            ? 'Location is off on this phone.'
            : me?.location_on
              ? 'Location is on while you are clocked in.'
              : locationAllowed
                ? 'Location is allowed.'
                : 'Checking location…'}
        </Text>
        <Meta>
          {locationAllowed === false
            ? 'Allow location so the office can see site visits, and so arriving at the office can ask you to clock in.'
            : me?.clocked_in && !me.location_on
              ? 'The phone allows location, but tracking is turned off in System.'
              : 'A trail is stored only while you are clocked in. While you are clocked out, location is used to notice the office.'}
        </Meta>
        {locationAllowed === false ? <Button label="Allow location" onPress={allowLocation} /> : null}
      </Card>
      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.line}>Work offline</Text>
            <Meta>
              {queued} waiting to sync{disconnected ? ' · no signal' : ''}
            </Meta>
          </View>
          <Switch value={forced} onValueChange={toggleOffline} />
        </View>
      </Card>
      <Button label="Sign out" onPress={signOut} tone="ink" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { color: colors.ink, fontFamily: font.bold, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
});
