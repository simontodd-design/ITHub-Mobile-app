import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isForcedOffline } from '@/reach';
import { getToken } from '@/session';

export function appVersion(): string {
  return Constants.nativeAppVersion || Constants.expoConfig?.version || '0';
}

const base = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://portal.ithubni.com').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Options = {
  method?: string;
  body?: unknown;
  form?: FormData;
  ignoreOffline?: boolean;
};

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  if (isForcedOffline() && !options.ignoreOffline) {
    throw new ApiError('Working offline.', 0);
  }

  const token = await getToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-ITHub-App-Platform': Platform.OS === 'ios' ? 'ios' : 'android',
    'X-ITHub-App-Version': appVersion(),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;

  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${base}/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as { message?: string };

  if (!response.ok) {
    const raw = payload.message ?? 'The request failed.';
    const message = /SQLSTATE|Unknown column|Base table or view/i.test(raw)
      ? 'The desk could not complete that.'
      : raw;

    throw new ApiError(message, response.status);
  }

  return payload as T;
}
