import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from '@/api';
import { clientId, enqueue } from '@/offline';

export const LOCATION_TASK = 'ithub-shift-location';
const MODE_KEY = 'ithub.location.mode';

type TrackMode = 'shift' | 'office' | 'off';
type TaskBody = { locations?: Location.LocationObject[] };
type OfficePrompt = { action: 'clock_in' | 'clock_out'; message: string; office_name: string } | null;
type FixResult = { callout?: { phase?: string | null } | null; office_prompt?: OfficePrompt };
type MobileConfig = {
  tracking_enabled: boolean;
  office_watch: boolean;
  location_interval_seconds: number;
  location_distance_metres: number;
};

let watch: Location.LocationSubscription | null = null;
let runningMode: TrackMode = 'off';
const fixListeners = new Set<(phase: string | null, officePrompt: boolean) => void>();

export function subscribeShiftFix(listener: (phase: string | null, officePrompt: boolean) => void): () => void {
  fixListeners.add(listener);

  return () => {
    fixListeners.delete(listener);
  };
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) {
    return;
  }

  const locations = (data as TaskBody).locations ?? [];
  const fix = locations[locations.length - 1];

  if (!fix) {
    return;
  }

  await publishFix(fix);
});

async function currentMode(): Promise<TrackMode> {
  if (runningMode !== 'off') {
    return runningMode;
  }

  const stored = await AsyncStorage.getItem(MODE_KEY);

  return stored === 'shift' || stored === 'office' ? stored : 'off';
}

async function publishFix(fix: Location.LocationObject): Promise<void> {
  const mode = await currentMode();

  if (mode === 'off') {
    return;
  }

  const body = {
    latitude: fix.coords.latitude,
    longitude: fix.coords.longitude,
    accuracy_metres: fix.coords.accuracy ? Math.round(fix.coords.accuracy) : null,
    recorded_at: new Date(fix.timestamp).toISOString(),
  };

  try {
    const result = await api<FixResult>(mode === 'shift' ? '/mobile/location' : '/mobile/presence', { method: 'POST', body });
    const phase = result.callout?.phase ?? null;
    fixListeners.forEach((listener) => listener(phase, Boolean(result.office_prompt)));
  } catch {
    if (mode === 'shift') {
      await enqueue({ client_id: clientId('loc'), type: 'location', ...body });
    }
  }
}

async function ensureUpdates(mode: 'shift' | 'office', config: MobileConfig): Promise<string | null> {
  const foreground = await Location.requestForegroundPermissionsAsync();

  if (foreground.status !== 'granted') {
    return mode === 'shift'
      ? 'Location permission is needed while you are clocked in.'
      : 'Location permission is needed to notice the office.';
  }

  await Location.requestBackgroundPermissionsAsync();
  await AsyncStorage.setItem(MODE_KEY, mode);

  if (runningMode !== mode) {
    await haltUpdates();
  }

  runningMode = mode;
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);

  if (!started) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: config.location_interval_seconds * 1000,
      distanceInterval: config.location_distance_metres,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'IT Hub',
        notificationBody: mode === 'shift'
          ? 'Location is on while you are clocked in.'
          : 'IT Hub asks when you arrive at or leave the office.',
      },
    });
  }

  if (!watch) {
    watch = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: config.location_interval_seconds * 1000,
        distanceInterval: config.location_distance_metres,
      },
      (fix) => {
        publishFix(fix).catch(() => undefined);
      },
    );
  }

  const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  await publishFix(current);

  return null;
}

async function haltUpdates(): Promise<void> {
  watch?.remove();
  watch = null;
  runningMode = 'off';

  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);

  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export async function startShiftTracking(): Promise<string | null> {
  const config = await api<MobileConfig>('/mobile/config');

  if (!config.tracking_enabled) {
    await stopShiftTracking();

    return 'Location tracking is turned off in System.';
  }

  return ensureUpdates('shift', config);
}

export async function startOfficeWatch(): Promise<string | null> {
  const config = await api<MobileConfig>('/mobile/config');

  if (!config.office_watch) {
    await stopShiftTracking();

    return null;
  }

  return ensureUpdates('office', config);
}

export async function stopShiftTracking(): Promise<void> {
  await AsyncStorage.setItem(MODE_KEY, 'off');
  await haltUpdates();
}

export async function answerOfficePrompt(decision: 'confirm' | 'dismiss', action: 'clock_in' | 'clock_out'): Promise<void> {
  await api('/mobile/office-prompt', { method: 'POST', body: { decision } });

  if (decision !== 'confirm') {
    return;
  }

  if (action === 'clock_in') {
    await startShiftTracking();

    return;
  }

  await startOfficeWatch();
}
