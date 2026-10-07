import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/api';
import { setToken } from '@/session';
import { colors, font } from '@/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      const result = await api<{ token: string }>('/mobile/login', {
        method: 'POST',
        body: { email, password, device_name: 'IT Hub phone' },
      });
      await setToken(result.token);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <Image source={require('../../assets/brand/logo-on-dark.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.lead}>Field companion for the day ahead.</Text>
      </View>
      <View style={styles.sheet}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.hint}>Use your desk account.</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} disabled={busy} onPress={submit}>
          <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.side },
  hero: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 28, gap: 10 },
  logo: { width: 148, height: 40 },
  lead: { color: colors.sideText, fontFamily: font.medium, fontSize: 16 },
  sheet: {
    flex: 1,
    backgroundColor: colors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    gap: 10,
  },
  title: { color: colors.ink, fontFamily: font.bold, fontSize: 28 },
  hint: { color: colors.muted, fontFamily: font.regular, marginBottom: 8 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    color: colors.ink,
    fontFamily: font.regular,
  },
  button: { backgroundColor: colors.greenDark, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
  error: { color: colors.danger, fontFamily: font.medium },
});
