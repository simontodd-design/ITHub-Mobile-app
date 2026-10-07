import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/api';
import { colors, font } from '@/theme';
import { BrandHeader, Meta, Screen } from '@/ui';

type Ticket = {
  id: number;
  subject: string;
  is_fast_tracked: boolean;
  status: string | null;
  customer: { name: string } | null;
  site: { name: string } | null;
};

export default function TicketsScreen() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    const today = await api<{ tickets: Ticket[] }>('/mobile/jobs/today');
    setTickets(today.tickets);
    setMessage(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch((err: Error) => setMessage(err.message));
    }, [load]),
  );

  const statuses = useMemo(() => {
    const names = tickets.map((ticket) => ticket.status).filter((status): status is string => Boolean(status));

    return [...new Set(names)];
  }, [tickets]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return tickets.filter((ticket) => {
      if (filter === 'fast' && !ticket.is_fast_tracked) {
        return false;
      }

      if (filter !== 'all' && filter !== 'fast' && ticket.status !== filter) {
        return false;
      }

      if (!needle) {
        return true;
      }

      const haystack = [String(ticket.id), ticket.subject, ticket.customer?.name, ticket.site?.name, ticket.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [tickets, query, filter]);

  async function refresh() {
    setRefreshing(true);

    try {
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load tickets.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Screen scroll={false} header={<BrandHeader eyebrow="Assigned to you" title="Tickets" />}>
      <View style={styles.tools}>
        <TextInput
          onChangeText={setQuery}
          placeholder="Search subject, customer, or number"
          placeholderTextColor={colors.muted}
          style={styles.search}
          value={query}
        />
        <View style={styles.filters}>
          {['all', 'fast', ...statuses].map((key) => {
            const on = filter === key;
            const label = key === 'all' ? 'All' : key === 'fast' ? 'Fast Track' : key;

            return (
              <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filter, on ? styles.filterOn : null]}>
                <Text style={on ? styles.filterOnText : styles.filterText}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.count}>
          {shown.length} of {tickets.length}
        </Text>
      </View>
      {message ? <Meta>{message}</Meta> : null}
      <FlatList
        data={shown}
        keyExtractor={(ticket) => String(ticket.id)}
        refreshing={refreshing}
        onRefresh={refresh}
        style={styles.flex}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Meta>{tickets.length === 0 ? 'No open tickets assigned to you.' : 'Nothing matches that search.'}</Meta>}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/job/${item.id}`)} style={styles.row}>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.subject}>
                {item.subject}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                {item.customer?.name ?? 'No customer'}
                {item.site?.name ? ` · ${item.site.name}` : ''}
                {item.status ? ` · ${item.status}` : ''}
              </Text>
            </View>
            {item.is_fast_tracked ? <View style={styles.dot} /> : null}
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tools: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  search: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontFamily: font.regular,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  filterOn: { backgroundColor: colors.greenSoft, borderColor: colors.greenDark },
  filterText: { color: colors.muted, fontFamily: font.semibold, fontSize: 13 },
  filterOnText: { color: colors.greenDark, fontFamily: font.bold, fontSize: 13 },
  count: { color: colors.muted, fontFamily: font.medium, fontSize: 12 },
  list: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  copy: { flex: 1, gap: 2 },
  subject: { color: colors.ink, fontFamily: font.semibold, fontSize: 15 },
  meta: { color: colors.muted, fontFamily: font.regular, fontSize: 13 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
});
