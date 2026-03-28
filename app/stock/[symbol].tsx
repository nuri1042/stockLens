import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { formatPrice } from '@/lib/format';
import { FinnhubApiError, fetchProfile, fetchQuote, type FinnhubQuote } from '@/lib/finnhub';
import { getFinnhubApiKey } from '@/lib/env';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function StockChartScreen() {
  const { symbol: raw } = useLocalSearchParams<{ symbol: string }>();
  const symbol = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  const upper = symbol.toUpperCase();

  const [quote, setQuote] = useState<FinnhubQuote | null>(null);
  const [name, setName] = useState<string>(upper);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const borderColor = useThemeColor({}, 'icon');
  const muted = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const tint = useThemeColor({}, 'tint');

  const load = useCallback(async () => {
    if (!upper) {
      setLoading(false);
      return;
    }
    if (!getFinnhubApiKey()) {
      setErr('API 키가 없습니다.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const [q, p] = await Promise.all([fetchQuote(upper), fetchProfile(upper)]);
      setQuote(q);
      setName(p?.name ?? upper);
    } catch (e) {
      setErr(e instanceof FinnhubApiError ? e.message : '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [upper]);

  useEffect(() => {
    load();
  }, [load]);

  const price = quote?.c && quote.c > 0 ? quote.c : quote?.pc ?? 0;
  const changePct = quote?.dp ?? 0;
  const up = changePct >= 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: upper || '종목',
          headerBackTitle: '목록',
        }}
      />
      <ThemedView style={styles.screen}>
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={tint} />
            </View>
          ) : err ? (
            <View style={styles.header}>
              <ThemedText type="subtitle">{upper}</ThemedText>
              <ThemedText style={{ color: muted }}>{err}</ThemedText>
            </View>
          ) : (
            <View style={styles.header}>
              <ThemedText type="subtitle">{name}</ThemedText>
              <View style={styles.priceRow}>
                <ThemedText type="title" style={styles.price}>
                  {price > 0 ? `$${formatPrice(price)}` : '—'}
                </ThemedText>
                {quote && quote.c > 0 ? (
                  <ThemedText
                    style={[
                      styles.change,
                      { color: up ? '#1a7f37' : '#cf222e' },
                    ]}>
                    {up ? '+' : ''}
                    {changePct.toFixed(2)}%
                  </ThemedText>
                ) : null}
              </View>
            </View>
          )}

          <View style={[styles.chartCard, { borderColor }]}>
            <ThemedText type="defaultSemiBold" style={styles.chartTitle}>
              가격 차트
            </ThemedText>
            <ThemedText style={[styles.chartHint, { color: muted }]}>
              D3.js로 캔들·시계열 차트를 그릴 영역입니다. 데이터 연동 후 구현합니다.
            </ThemedText>
            <View style={[styles.chartPlaceholder, { borderColor }]} />
          </View>
        </SafeAreaView>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  center: {
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    gap: 8,
    marginBottom: 24,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  price: {
    fontSize: 28,
    lineHeight: 34,
  },
  change: {
    fontSize: 17,
    fontWeight: '600',
  },
  chartCard: {
    flex: 1,
    minHeight: 320,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  chartTitle: {
    fontSize: 17,
  },
  chartHint: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  chartPlaceholder: {
    flex: 1,
    minHeight: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.6,
  },
});
