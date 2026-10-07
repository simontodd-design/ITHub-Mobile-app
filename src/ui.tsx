import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertsBell } from '@/AlertsBell';
import { isForcedOffline, loadForcedOffline, subscribeForcedOffline } from '@/reach';
import { colors, font } from '@/theme';

export function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [active]);

  return now;
}

export function useOffline(): boolean {
  const [forced, setForced] = useState(isForcedOffline());
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    loadForcedOffline().then(setForced);
    const unsubscribeForced = subscribeForcedOffline(setForced);
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setDisconnected(state.isConnected === false);
    });

    return () => {
      unsubscribeForced();
      unsubscribeNet();
    };
  }, []);

  return forced || disconnected;
}

export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  header,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  header?: ReactNode;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenDark} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{children}</View>
  );

  return (
    <View style={styles.screen}>
      {header ?? <SafeAreaView edges={['top']} />}
      <OfflineBanner />
      {body}
    </View>
  );
}

export function BrandHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <SafeAreaView edges={['top']} style={styles.header}>
      <View style={styles.headerRow}>
        <Image source={require('../assets/brand/logo-on-dark.png')} style={styles.logo} resizeMode="contain" />
        <View style={styles.headerCopy}>
          {eyebrow ? (
            <Text numberOfLines={1} style={styles.headerEyebrow}>
              {eyebrow}
            </Text>
          ) : null}
          <Text numberOfLines={1} style={styles.headerTitle}>
            {title}
          </Text>
        </View>
        {children}
        <AlertsBell />
      </View>
    </SafeAreaView>
  );
}

export function OfflineBanner() {
  const offline = useOffline();

  if (!offline) {
    return null;
  }

  return <Text style={styles.banner}>Working offline — changes will sync when you're back in signal</Text>;
}

export function Card({ children, style, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; accent?: string }) {
  return (
    <View style={[styles.card, accent ? { borderColor: accent, borderWidth: 2 } : null, style]}>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  tone = 'accent',
  disabled,
}: {
  label: string;
  onPress?: PressableProps['onPress'];
  tone?: 'accent' | 'ink' | 'danger' | 'blue' | 'ghost';
  disabled?: boolean;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.button, styles[tone], disabled ? styles.disabled : null]}>
      <Text style={[styles.buttonText, tone === 'ghost' ? styles.ghostText : null]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'blue' | 'accent' | 'warn' }) {
  return (
    <View style={[styles.pill, pillTones[tone]]}>
      <Text style={[styles.pillText, pillText[tone]]}>{label}</Text>
    </View>
  );
}

export function Meta({ children }: { children: ReactNode }) {
  return <Text style={styles.meta}>{children}</Text>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <Text style={styles.notice}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  fill: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 28, gap: 12 },
  header: { backgroundColor: colors.side, paddingHorizontal: 22, paddingTop: 16, paddingBottom: 18 },
  logo: { width: 86, height: 46 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52 },
  headerCopy: { flex: 1, gap: 2, paddingRight: 8 },
  headerEyebrow: { color: colors.sideText, fontFamily: font.medium, fontSize: 12 },
  headerTitle: { color: '#fff', fontFamily: font.semibold, fontSize: 16 },
  banner: { backgroundColor: colors.warn, color: '#fff', textAlign: 'center', fontFamily: font.semibold, paddingVertical: 6, paddingHorizontal: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  button: { borderRadius: 14, paddingVertical: 16, paddingHorizontal: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
  accent: { backgroundColor: colors.accent },
  ink: { backgroundColor: colors.ink },
  danger: { backgroundColor: colors.danger },
  blue: { backgroundColor: colors.blue },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  ghostText: { color: colors.ink },
  disabled: { opacity: 0.55 },
  pill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontFamily: font.bold },
  meta: { color: colors.muted, marginTop: 2, fontFamily: font.regular },
  notice: { color: colors.ink, fontFamily: font.medium },
});

const pillTones = StyleSheet.create({
  muted: { backgroundColor: colors.paper },
  blue: { backgroundColor: colors.blue },
  accent: { backgroundColor: colors.accent },
  warn: { backgroundColor: colors.warn },
});

const pillText = StyleSheet.create({
  muted: { color: colors.ink },
  blue: { color: '#fff' },
  accent: { color: '#fff' },
  warn: { color: '#fff' },
});
