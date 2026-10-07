import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { api } from '@/api';
import { colors, font } from '@/theme';

export function AlertsBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const me = await api<{ unread_alerts?: number }>('/mobile/me');
      setUnread(me.unread_alerts ?? 0);
    } catch {
      // The alerts screen still loads its own list.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
      const timer = setInterval(() => {
        load().catch(() => undefined);
      }, 20000);

      return () => clearInterval(timer);
    }, [load]),
  );

  return (
    <Pressable accessibilityLabel="Alerts" hitSlop={10} onPress={() => router.push('/alerts')} style={styles.hit}>
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2h-15L6 16Z" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
        <Path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth={1.8} />
      </Svg>
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.ink, fontFamily: font.bold, fontSize: 10 },
});
