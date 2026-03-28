import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { LIQUID_US_SYMBOLS } from '@/constants/liquidUniverse';
import { formatPrice, formatVolume } from '@/lib/format';
import {
  FINNHUB_MARKET_RANKING_TOP,
  FinnhubApiError,
  enrichStockRankingRowNames,
  fetchFinnhubMarketUniverse,
  pickTopPlunge,
  pickTopSurge,
  type StockRankingRow,
} from '@/lib/finnhub';
import { getFinnhubApiKey } from '@/lib/env';
import { useThemeColor } from '@/hooks/useThemeColor';

type MomentumFilter = 'surge' | 'plunge';

const LIST_LIMIT = FINNHUB_MARKET_RANKING_TOP;

const FILTER_LABELS: Record<MomentumFilter, string> = {
  surge: '급상승',
  plunge: '급하락',
};

export default function VolumeLeadersScreen() {
  const [rawRows, setRawRows] = useState<StockRankingRow[]>([]);
  const [momentumFilter, setMomentumFilter] = useState<MomentumFilter>('surge');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoLoadRef = useRef(false);

  const borderColor = useThemeColor({ light: '#E5E7EB', dark: '#2C2C2E' }, 'icon');
  const rowBorder = useThemeColor({ light: '#E5E7EB', dark: '#38383A' }, 'icon');
  const muted = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const tint = useThemeColor({}, 'tint');
  const cardBg = useThemeColor({}, 'background');

  const rows = useMemo(() => {
    if (momentumFilter === 'surge') {
      return pickTopSurge(rawRows, LIST_LIMIT);
    }
    return pickTopPlunge(rawRows, LIST_LIMIT);
  }, [rawRows, momentumFilter]);

  const load = useCallback(async (isRefresh: boolean) => {
    if (!getFinnhubApiKey()) {
      setError(
        'EXPO_PUBLIC_FINNHUB_API_KEY가 없습니다. env / .env를 확인한 뒤 Metro를 재시작하세요.'
      );
      setRawRows([]);
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
      const universe = await fetchFinnhubMarketUniverse(LIQUID_US_SYMBOLS);
      const surge = pickTopSurge(universe, LIST_LIMIT);
      const plunge = pickTopPlunge(universe, LIST_LIMIT);
      const enrichKeys = new Set<string>();
      for (const r of surge) enrichKeys.add(r.symbol);
      for (const r of plunge) enrichKeys.add(r.symbol);
      await enrichStockRankingRowNames(
        [...enrichKeys].map((s) => universe.find((u) => u.symbol === s)!)
      );
      setRawRows(universe);
    } catch (e) {
      const msg =
        e instanceof FinnhubApiError ? e.message : '데이터를 불러오지 못했습니다.';
      setError(msg);
      setRawRows([]);
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

  const selectFilter = (next: MomentumFilter) => {
    setMomentumFilter(next);
    setDropdownOpen(false);
  };

  const renderItem = ({ item }: { item: StockRankingRow }) => {
    const up = item.changePercent >= 0;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.symbol} 차트 보기`}
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
          {item.name !== item.symbol ? (
            <ThemedText style={[styles.name, { color: muted }]} numberOfLines={1}>
              {item.name}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.rowRight}>
          <ThemedText type="defaultSemiBold" style={styles.vol}>
            {formatVolume(item.volume)}
          </ThemedText>
          <ThemedText style={[styles.volLabel, { color: muted }]}>
            거래량
          </ThemedText>
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
            인기 급상승
          </ThemedText>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="등락 필터"
            onPress={() => setDropdownOpen(true)}
            style={[
              styles.dropdownTrigger,
              { borderColor: rowBorder, backgroundColor: cardBg },
            ]}>
            <ThemedText type="defaultSemiBold" style={styles.dropdownTriggerText}>
              등락률 · {FILTER_LABELS[momentumFilter]}
            </ThemedText>
            <Ionicons name="chevron-down" size={20} color={muted} />
          </Pressable>
        </View>

        <Modal
          visible={dropdownOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDropdownOpen(false)}>
          <View style={styles.modalRoot}>
            <Pressable
              style={[styles.modalDim, { backgroundColor: 'rgba(0,0,0,0.35)' }]}
              onPress={() => setDropdownOpen(false)}
            />
            <View style={styles.modalSheetWrap} pointerEvents="box-none">
              <View style={[styles.modalSheet, { backgroundColor: cardBg, borderColor: rowBorder }]}>
                <ThemedText type="defaultSemiBold" style={[styles.modalTitle, { color: muted }]}>
                  보기
                </ThemedText>
                {(['surge', 'plunge'] as const).map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => selectFilter(key)}
                    style={[
                      styles.modalOption,
                      momentumFilter === key && { backgroundColor: `${tint}18` },
                    ]}>
                    <ThemedText
                      style={[
                        styles.modalOptionText,
                        { color: momentumFilter === key ? tint : undefined },
                      ]}>
                      {FILTER_LABELS[key]}
                    </ThemedText>
                    {momentumFilter === key ? (
                      <Ionicons name="checkmark" size={22} color={tint} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </Modal>

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
              <ThemedText style={[styles.hint, { color: muted, textAlign: 'center', marginTop: 24 }]}>
                {momentumFilter === 'surge'
                  ? '등락률이 플러스인 종목이 없습니다.'
                  : '등락률이 마이너스인 종목이 없습니다.'}
              </ThemedText>
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
    gap: 12,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dropdownTriggerText: {
    fontSize: 15,
  },
  modalRoot: {
    flex: 1,
  },
  modalDim: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheetWrap: {
    flex: 1,
    paddingTop: 160,
    paddingHorizontal: 24,
  },
  modalSheet: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 13,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  modalOptionText: {
    fontSize: 17,
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
    maxWidth: '52%',
  },
  symbol: {
    fontSize: 17,
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 13,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  vol: {
    fontSize: 16,
  },
  volLabel: {
    fontSize: 11,
    opacity: 0.7,
    marginBottom: 4,
  },
  price: {
    fontSize: 15,
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
