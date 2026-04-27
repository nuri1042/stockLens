import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { formatPrice } from '@/lib/format';
import { getFavoriteSymbols } from '@/lib/favorites';
import { KisApiError, fetchWatchlistRows, hasKisCredentials } from '@/lib/kis';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function WatchlistScreen() {
  const [rows, setRows] = useState<
    {
      symbol: string;
      name: string;
      price: number;
      changePercent: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const borderColor = useThemeColor({ light: '#E5E7EB', dark: '#2C2C2E' }, 'icon');
  const rowBorder = useThemeColor({ light: '#E5E7EB', dark: '#38383A' }, 'icon');
  const muted = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const tint = useThemeColor({}, 'tint');

  const load = useCallback(async (isRefresh: boolean) => {
    if (!hasKisCredentials()) {
      setError('EXPO_PUBLIC_KIS_APP_KEY / EXPO_PUBLIC_KIS_APP_SECRET이 없습니다.');
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
      const favorites = await getFavoriteSymbols();
      if (favorites.length === 0) {
        setRows([]);
        return;
      }
      const data = await fetchWatchlistRows(favorites);
      setRows(data);
    } catch (e) {
      const msg = e instanceof KisApiError ? e.message : '데이터를 불러오지 못했습니다.';
      setError(msg);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const renderItem = ({
    item,
  }: {
    item: {
      symbol: string;
      name: string;
      price: number;
      changePercent: number;
    };
  }) => {
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
            ₩{formatPrice(item.price)}
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
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <ThemedText style={[styles.hint, { color: muted, textAlign: 'center' }]}>
                  아직 관심종목이 없습니다.
                </ThemedText>
                <ThemedText style={[styles.hint, { color: muted, textAlign: 'center' }]}>
                  인기 급상승 탭에서 별표를 눌러 추가해보세요.
                </ThemedText>
              </View>
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
  emptyWrap: {
    marginTop: 28,
    alignItems: 'center',
    gap: 2,
  },
});
