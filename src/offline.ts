import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/api';

const KEY = 'ithub.offline';

export type OfflineOp = {
  client_id: string;
  type: 'note' | 'location' | 'timer_stop' | 'signature' | 'scan';
  [key: string]: unknown;
};

export async function enqueue(op: OfflineOp): Promise<void> {
  const current = await readQueue();
  current.push(op);
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}

export async function flushQueue(): Promise<void> {
  const current = await readQueue();

  if (current.length === 0) {
    return;
  }

  const response = await api<{ results: { client_id: string; ok: boolean }[] }>('/mobile/sync', {
    method: 'POST',
    body: { operations: current },
    ignoreOffline: true,
  });

  const failed = new Set(response.results.filter((row) => !row.ok).map((row) => row.client_id));
  const remaining = current.filter((op) => failed.has(op.client_id));
  await AsyncStorage.setItem(KEY, JSON.stringify(remaining));
}

export async function queueCount(): Promise<number> {
  return (await readQueue()).length;
}

async function readQueue(): Promise<OfflineOp[]> {
  const raw = await AsyncStorage.getItem(KEY);

  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as OfflineOp[];
  } catch {
    return [];
  }
}

export function clientId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
