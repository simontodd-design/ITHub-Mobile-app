import * as WebBrowser from 'expo-web-browser';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font } from '@/theme';

type Props = {
  message: string;
  iosUrl: string | null;
  portalUrl: string | null;
};

export function UpdateRequired({ message, iosUrl, portalUrl }: Props) {
  const ios = Platform.OS === 'ios';
  const url = ios ? iosUrl : portalUrl;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.kicker}>IT Hub</Text>
        <Text style={styles.title}>A new version is ready</Text>
        <Text style={styles.body}>{message}</Text>
        <Text style={styles.body}>
          {ios
            ? 'Open the App Store and install the update. This copy cannot be used until then.'
            : 'Open the portal, sign in, and use Get the app. This copy cannot be used until then.'}
        </Text>
        {url ? (
          <Pressable style={styles.button} onPress={() => WebBrowser.openBrowserAsync(url)}>
            <Text style={styles.buttonText}>{ios ? 'Open the App Store' : 'Open the portal'}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.side,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  kicker: {
    fontFamily: font.semibold,
    color: colors.accent,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  title: {
    fontFamily: font.bold,
    color: colors.ink,
    fontSize: 24,
  },
  body: {
    fontFamily: font.regular,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.greenDark,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: font.semibold,
    color: '#fff',
    fontSize: 16,
  },
});
