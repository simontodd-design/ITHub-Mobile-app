import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api';
import { getToken } from '@/session';
import { colors, font } from '@/theme';
import { Button } from '@/ui';

type Prompt = {
  message: string;
  clocks_out_at: string;
  answers_by: string;
};

export function StillWorking() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;

    async function tick() {
      const token = await getToken();

      if (!token || stop) {
        if (!stop) {
          setPrompt(null);
        }

        return;
      }

      try {
        const me = await api<{ still_working?: Prompt | null }>('/mobile/me');

        if (!stop) {
          setPrompt(me.still_working ?? null);
        }
      } catch {
        // Keep the prompt on screen if this check fails.
      }
    }

    tick();
    const timer = setInterval(tick, 8000);

    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  async function answer(working: boolean) {
    setBusy(true);

    try {
      await api('/mobile/still-working', { method: 'POST', body: { working } });
      setPrompt(null);
    } catch {
      setBusy(false);

      return;
    }

    setBusy(false);
  }

  return (
    <Modal visible={prompt !== null} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>End of day</Text>
          <Text style={styles.title}>{prompt?.message}</Text>
          <Text style={styles.lead}>
            The shift clocks out at {prompt?.clocks_out_at} if you do not answer by {prompt?.answers_by}. Answering on the portal closes this as well.
          </Text>
          <Button disabled={busy} label="Yes, still working" onPress={() => answer(true)} />
          <Button disabled={busy} label="No, clock me out" onPress={() => answer(false)} tone="danger" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  card: {
    gap: 12,
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.card,
  },
  kicker: {
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 22,
    color: colors.ink,
  },
  lead: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
});
