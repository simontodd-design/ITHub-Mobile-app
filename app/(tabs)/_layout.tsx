import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';

function TabGlyph({ focused, color, paths }: { focused: boolean; color: string; paths: string[] }) {
  return (
    <View
      style={{
        width: 46,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        backgroundColor: focused ? colors.greenSoft : 'transparent',
      }}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24">
        {paths.map((d) => (
          <Path key={d} d={d} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
        ))}
      </Svg>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.greenDark,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph color={focused ? colors.greenDark : color} focused={focused} paths={['M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z']} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph color={focused ? colors.greenDark : color} focused={focused} paths={['M4 6v12M8 6v12M12 6v12M15 6v12M18 6v12M21 6v12']} />
          ),
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: 'Time off',
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph
              color={focused ? colors.greenDark : color}
              focused={focused}
              paths={['M12 8.5a3.5 3.5 0 1 0 0.01 0', 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4']}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph
              color={focused ? colors.greenDark : color}
              focused={focused}
              paths={['M7 3h10a1 1 0 0 1 1 1v16l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z', 'M9 8h6M9 12h6']}
            />
          ),
        }}
      />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="stock" options={{ href: null }} />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph
              color={focused ? colors.greenDark : color}
              focused={focused}
              paths={['M12 5a3 3 0 1 0 0.01 0', 'M5 19.5c1.2-3 3.4-4.5 7-4.5s5.8 1.5 7 4.5']}
            />
          ),
        }}
      />
    </Tabs>
  );
}
