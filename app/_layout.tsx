import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, BackHandler, View } from 'react-native';
import { registerPush } from '@/push';
import { getToken } from '@/session';
import { colors } from '@/theme';
import '@/location';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const segments = useSegments();
  const router = useRouter();
  const pushStarted = useRef(false);
  useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });

  useEffect(() => {
    getToken().then((token) => {
      setSignedIn(Boolean(token));
      setReady(true);
    });
  }, [segments]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (segments[0] === '(tabs)' || !router.canGoBack()) {
        return true;
      }

      return false;
    });

    return () => sub.remove();
  }, [router, segments]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const onAuth = segments[0] === '(auth)';

    if (!signedIn && !onAuth) {
      router.replace('/login');
    }

    if (signedIn && onAuth) {
      router.replace('/');
    }

    if (signedIn && !pushStarted.current) {
      pushStarted.current = true;
      registerPush().catch(() => undefined);
    }
  }, [ready, signedIn, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={colors.side} />
      <Stack screenOptions={{ headerShown: false, gestureEnabled: true }}>
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
      </Stack>
    </>
  );
}
