import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ithub.force-offline';

let forced = false;
const listeners = new Set<(value: boolean) => void>();

export function isForcedOffline(): boolean {
  return forced;
}

export async function loadForcedOffline(): Promise<boolean> {
  forced = (await AsyncStorage.getItem(KEY)) === '1';
  listeners.forEach((listener) => listener(forced));

  return forced;
}

export async function setForcedOffline(value: boolean): Promise<void> {
  forced = value;
  listeners.forEach((listener) => listener(value));
  await AsyncStorage.setItem(KEY, value ? '1' : '0');
}

export function subscribeForcedOffline(listener: (value: boolean) => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
