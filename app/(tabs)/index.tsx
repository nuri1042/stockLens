import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  GestureResponderEvent,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { formatPrice, formatVolume } from '@/lib/format';
import {
  KisApiError,
  KIS_VOLUME_RANK_MAX,
  fetchDomesticVolumeRank,
  pickTopPlunge,
  pickTopSurge,
  hasKisCredentials,
  type StockRankingRow,
} from '@/lib/kis';
import { getFavoriteSymbols, toggleFavoriteSymbol } from '@/lib/favorites';
import { useThemeColor } from '@/hooks/useThemeColor';

type MomentumFilter = 'volume' | 'surge' | 'plunge';

const LIST_LIMIT = KIS_VOLUME_RANK_MAX;
const PAGE_SIZE = 10;

const FILTER_LABELS: Record<MomentumFilter, string> = {
  volume: '거래량순',
  surge: '급상승',
  plunge: '급하락',
};

export default function VolumeLeadersScreen() {
  const [rawRows, setRawRows] = useState<StockRankingRow[]>([]);
  const [momentumFilter, setMomentumFilter] = useState<MomentumFilter>('volume');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const didAutoLoadRef = useRef(false);

  const borderColor = useThemeColor({ light: '#E5E7EB', dark: '#2C2C2E' }, 'icon');
  const rowBorder = useThemeColor({ light: '#E5E7EB', dark: '#38383A' }, 'icon');
  const muted = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const tint = useThemeColor({}, 'tint');
  const cardBg = useThemeColor({}, 'background');

  const rows = useMemo(() => {
    if (momentumFilter === 'volume') {
      return rawRows.slice(0, LIST_LIMIT);
    }
    if (momentumFilter === 'surge') {
      return pickTopSurge(rawRows, LIST_LIMIT);
    }
    return pickTopPlunge(rawRows, LIST_LIMIT);
  }, [rawRows, momentumFilter]);
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  const canLoadMore = visibleRows.length < rows.length;

  const load = useCallback(async (isRefresh: boolean) => {
    if (!hasKisCredentials()) {
      setError(
        'EXPO_PUBLIC_KIS_APP_KEY / EXPO_PUBLIC_KIS_APP_SECRET이 없습니다. .env를 확인한 뒤 Metro를 재시작하세요.'
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
      const ranked = await fetchDomesticVolumeRank();
      setRawRows(ranked);
      setVisibleCount(PAGE_SIZE);
    } catch (e) {
      const msg = e instanceof KisApiError ? e.message : '데이터를 불러오지 못했습니다.';
      setError(msg);
      setRawRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    const favorites = await getFavoriteSymbols();
    setFavoriteSymbols(favorites);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (didAutoLoadRef.current) {
        void loadFavorites();
        return;
      }
      didAutoLoadRef.current = true;
      void loadFavorites();
      void load(false);
    }, [load, loadFavorites])
  );

  const selectFilter = (next: MomentumFilter) => {
    setMomentumFilter(next);
    setDropdownOpen(false);
    setVisibleCount(PAGE_SIZE);
  };

  const onLoadMore = () => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, rows.length));
  };

  const onToggleFavorite = useCallback(async (symbol: string) => {
    const next = await toggleFavoriteSymbol(symbol);
    setFavoriteSymbols(next);
  }, []);

  const renderItem = ({ item, index }: { item: StockRankingRow; index: number }) => {
    const up = item.changePercent >= 0;
    const isFavorite = favoriteSymbols.includes(item.symbol);
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
          styles.tableRow,
          { borderBottomColor: rowBorder },
          pressed && styles.rowPressed,
        ]}>
        <View style={styles.colStock}>
          <View style={styles.rankWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isFavorite ? `${item.symbol} 즐겨찾기 해제` : `${item.symbol} 즐겨찾기 추가`
              }
              hitSlop={8}
              onPress={(e: GestureResponderEvent) => {
                e.stopPropagation();
                void onToggleFavorite(item.symbol);
              }}
              style={styles.starButton}>
              <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={16} color={tint} />
            </Pressable>
            <ThemedText style={styles.rankText}>{index + 1}</ThemedText>
          </View>
          <ThemedText type="defaultSemiBold" style={styles.symbol} numberOfLines={1}>
            {item.name !== item.symbol ? item.name : item.symbol}
          </ThemedText>
        </View>
        <View style={styles.colPrice}>
          <ThemedText type="defaultSemiBold" style={styles.price}>
            {formatPrice(item.price)}
          </ThemedText>
        </View>
        <View style={styles.colChange}>
          <ThemedText style={[styles.pct, { color: up ? '#d12b4f' : '#1a7f37' }]}>
            {up ? '+' : ''}
            {item.changePercent.toFixed(2)}%
          </ThemedText>
        </View>
        <View style={styles.colVolume}>
          <ThemedText type="defaultSemiBold" style={styles.vol}>
            {formatVolume(item.volume)}
          </ThemedText>
          <ThemedText style={[styles.volLabel, { color: muted }]}>
            거래량
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
            accessibilityLabel="순위 보기 필터"
            onPress={() => setDropdownOpen(true)}
            style={[
              styles.dropdownTrigger,
              { borderColor: rowBorder, backgroundColor: cardBg },
            ]}>
            <ThemedText type="defaultSemiBold" style={styles.dropdownTriggerText}>
              보기 · {FILTER_LABELS[momentumFilter]}
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
                {(['volume', 'surge', 'plunge'] as const).map((key) => (
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
          <View style={styles.tableWrap}>
            <View style={[styles.tableHeader, { borderBottomColor: rowBorder }]}>
              <View style={styles.colStock}>
                <ThemedText style={styles.headText}>순위 · 종목</ThemedText>
              </View>
              <View style={styles.colPrice}>
                <ThemedText style={styles.headText}>현재가</ThemedText>
              </View>
              <View style={styles.colChange}>
                <ThemedText style={styles.headText}>등락률</ThemedText>
              </View>
              <View style={styles.colVolume}>
                <ThemedText style={styles.headText}>거래량</ThemedText>
              </View>
            </View>
            <FlatList
              data={visibleRows}
              keyExtractor={(item) => item.symbol}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={tint} />
              }
              ListEmptyComponent={
                <ThemedText style={[styles.hint, { color: muted, textAlign: 'center', marginTop: 24 }]}>
                  {momentumFilter === 'volume'
                    ? '거래량 순위 데이터가 없습니다.'
                    : momentumFilter === 'surge'
                      ? '등락률이 플러스인 종목이 없습니다.'
                      : '등락률이 마이너스인 종목이 없습니다.'}
                </ThemedText>
              }
              ListFooterComponent={
                canLoadMore ? (
                  <Pressable onPress={onLoadMore} style={[styles.moreButton, { borderColor: tint }]}>
                    <ThemedText style={{ color: tint }}>더보기</ThemedText>
                  </Pressable>
                ) : null
              }
            />
          </View>
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
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 100,
  },
  tableWrap: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingBottom: 10,
    marginBottom: 2,
  },
  headText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  rowPressed: {
    opacity: 0.85,
  },
  colStock: {
    flex: 2.4,
    paddingRight: 6,
  },
  colPrice: {
    flex: 1.3,
    alignItems: 'flex-end',
  },
  colChange: {
    flex: 1.1,
    alignItems: 'flex-end',
  },
  colVolume: {
    flex: 1.3,
    alignItems: 'flex-end',
  },
  rankWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  rankText: {
    fontSize: 12,
    opacity: 0.8,
  },
  symbol: {
    fontSize: 15,
  },
  name: {
    fontSize: 13,
  },
  starButton: {
    padding: 0,
  },
  vol: {
    fontSize: 13,
  },
  volLabel: {
    fontSize: 10,
    opacity: 0.7,
  },
  price: {
    fontSize: 14,
  },
  pct: {
    fontSize: 13,
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
  moreButton: {
    marginTop: 14,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
