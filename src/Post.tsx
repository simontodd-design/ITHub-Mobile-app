import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { paragraphs, splitNote } from '@/noteBody';
import { colors, font } from '@/theme';

export function NoteBody({ body }: { body: string | null | undefined }) {
  const parts = splitNote(body);
  const [open, setOpen] = useState(false);
  const shown = open && parts.hidden ? `${parts.preview}\n\n${parts.hidden}` : parts.preview;

  if (!shown) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {paragraphs(shown).map((paragraph, index) => (
        <Text key={`${index}-${paragraph.slice(0, 12)}`} style={styles.paragraph}>
          {paragraph}
        </Text>
      ))}
      {parts.collapsible ? (
        <Pressable onPress={() => setOpen((value) => !value)}>
          <Text style={styles.toggle}>
            {open ? (parts.hasFooter ? 'Hide footer' : 'Show less') : parts.hasFooter ? 'Show footer' : 'Show full message'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  paragraph: { color: colors.ink, fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  toggle: { color: colors.greenDark, fontFamily: font.bold, marginTop: 2 },
});
