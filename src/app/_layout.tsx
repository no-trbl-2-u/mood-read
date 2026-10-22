import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PlayerProvider } from '@/player/PlayerProvider';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  return (
    <PlayerProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Library' }} />
        <Stack.Screen name="book/[id]" options={{ title: '' }} />
      </Stack>
    </PlayerProvider>
  );
}
