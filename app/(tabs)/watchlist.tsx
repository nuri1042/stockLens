import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { WATCHLIST_SYMBOLS, type WatchlistItem } from '@/constants/watchlist';
import { formatPrice } from '@/lib/format';
import { FinnhubApiError, fetchWatchlistRows } from '@/lib/finnhub';
import { getFinnhubApiKey } from '@/lib/env';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function WatchlistScreen() {
  const [rows, setRows] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoLoadRef = useRef(false);

  const borderColor = useThemeColor({ light: '#E5E7EB', dark: '#2C2C2E' }, 'icon');
  const rowBorder = useThemeColor({ light: '#E5E7EB', dark: '#38383A' }, 'icon');
  const muted = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const tint = useThemeColor({}, 'tint');

  const load = useCallback(async (isRefresh: boolean) => {
    if (!getFinnhubApiKey()) {
      setError('EXPO_PUBLIC_FINNHUB_API_KEY가 없습니다.');
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await fetchWatchlistRows(WATCHLIST_SYMBOLS);
      setRows(data);
    } catch (e) {
      const msg = e instanceof FinnhubApiError ? e.message : '데이터를 불러오지 못했습니다.';
      setError(msg);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (didAutoLoadRef.current) {
        return;
      }
      didAutoLoadRef.current = true;
      void load(false);
    }, [load])
  );

  const renderItem = ({ item }: { item: WatchlistItem }) => {
    const up = item.changePercent >= 0;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name} 차트 보기`}
        onPress={() =>
          router.push({
            pathname: '/stock/[symbol]',
            params: { symbol: item.symbol },
          })
        }
        style={({ pressed }) => [
          styles.row,
          { borderColor: rowBorder },
          pressed && styles.rowPressed,
        ]}>
        <View style={styles.rowMain}>
          <ThemedText type="defaultSemiBold" style={styles.symbol}>
            {item.symbol}
          </ThemedText>
          <ThemedText style={[styles.name, { color: muted }]} numberOfLines={1}>
            {item.name}
          </ThemedText>
        </View>
        <View style={styles.rowRight}>
          <ThemedText type="defaultSemiBold" style={styles.price}>
            ${formatPrice(item.price)}
          </ThemedText>
          <ThemedText style={[styles.pct, { color: up ? '#1a7f37' : '#cf222e' }]}>
            {up ? '+' : ''}
            {item.changePercent.toFixed(2)}%
          </ThemedText>
        </View>
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <ThemedText type="title" style={styles.title}>
            관심종목
          </ThemedText>
        </View>

        {error ? (
          <View style={styles.center}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <Pressable onPress={() => load(false)} style={[styles.retry, { borderColor: tint }]}>
              <ThemedText style={{ color: tint }}>다시 시도</ThemedText>
            </Pressable>
          </View>
        ) : loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={tint} />
            <ThemedText style={[styles.hint, { color: muted }]}>불러오는 중…</ThemedText>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.symbol}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={tint} />
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  sub: {
    fontSize: 14,
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowMain: {
    flex: 1,
    marginRight: 12,
    gap: 4,
  },
  symbol: {
    fontSize: 17,
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 14,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  price: {
    fontSize: 16,
  },
  pct: {
    fontSize: 14,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  retry: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    marginTop: 12,
    fontSize: 14,
  },
});
