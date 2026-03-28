// src/screens/Calendar/CalendarScreen.tsx
// Upcoming meetings & conflict detector powered by Google Calendar API.
// Accessible by tapping the connected-calendar banner on HomeScreen.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, StatusBar, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { NavProp } from '../../../app/index';
import {
  CalendarEvent, ConflictPair, fetchAllAccountsEvents,
  fmtDate, fmtTime, isSameDay, durationMins,
} from '../../services/calendarService';
import { getAllGoogleAccounts } from '../../services/googleAuthService';
import { getAllOutlookAccounts } from '../../services/outlookAuthService';

// ── Per-account colour palette ─────────────────────────────────────────────
const ACCOUNT_COLORS = [
  '#4285F4', // Google Blue
  '#34A853', // Google Green
  '#FBBC05', // Google Yellow
  '#EA4335', // Google Red
  '#9C27B0', // Purple
  '#FF9800', // Orange
];

// Microsoft accounts get a fixed Microsoft-blue colour
const OUTLOOK_COLOR = '#0078D4';

function isOutlookEmail(email: string, outlookAccounts: string[]): boolean {
  return outlookAccounts.includes(email);
}

function getAccountColor(email: string, allAccounts: string[], outlookAccounts: string[] = []): string {
  if (outlookAccounts.includes(email)) return OUTLOOK_COLOR;
  const idx = allAccounts.indexOf(email);
  return ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length] ?? '#4285F4';
}

/** Abbreviate email to initials — e.g. "khavyasakthi1@gmail.com" → "KS" */
function emailInitials(email: string): string {
  const name = email.split('@')[0];
  const parts = name.replace(/[._\-0-9]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  bg:         '#0D0D0D',
  surface:    '#161616',
  surfaceEl:  '#1E1E1E',
  verdigris:  '#1B998B',
  chartreuse: '#D5FF3F',
  chartreuseB:'#A8CC00',
  salmon:     '#FF6B6B',
  crimson:    '#FF3B30',
  orange:     '#FF9500',
  white:      '#FFFFFF',
  textSec:    '#9A9A9A',
  textTer:    '#555555',
  border:     '#2A2A2A',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}
function isTomorrow(d: Date): boolean {
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  return isSameDay(d, tom);
}
function dayLabel(d: Date): string {
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return fmtDate(d);
}

/** Group events by calendar date string */
function groupByDay(events: CalendarEvent[]): [string, CalendarEvent[]][] {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = ev.startTime.toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  return Array.from(map.entries());
}

/** True if this event is part of any conflict pair */
function isConflicted(ev: CalendarEvent, conflicts: ConflictPair[]): boolean {
  return conflicts.some(c => c.a.id === ev.id || c.b.id === ev.id);
}

// ── Event card ────────────────────────────────────────────────────────────────
function EventCard({
  event,
  conflicted,
  expanded,
  onToggle,
  accountColor,
}: {
  event: CalendarEvent;
  conflicted: boolean;
  expanded: boolean;
  onToggle: () => void;
  accountColor: string;
}) {
  const accentColor = conflicted ? C.crimson : accountColor;
  const dur = durationMins(event.startTime, event.endTime);
  const durLabel =
    dur >= 60
      ? `${Math.floor(dur / 60)}h${dur % 60 ? ` ${dur % 60}m` : ''}`
      : `${dur}m`;

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.85}
      style={[s.eventCard, conflicted && s.eventCardConflict]}
    >
      {/* Left accent bar — coloured by account */}
      <View style={[s.accentBar, { backgroundColor: accentColor }]} />

      <View style={s.eventBody}>
        {/* Top row */}
        <View style={s.eventTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.eventTitle} numberOfLines={expanded ? 0 : 1}>
              {event.title}
            </Text>
            {conflicted && (
              <View style={s.conflictBadge}>
                <View style={s.conflictDot} />
                <Text style={s.conflictBadgeText}>CONFLICT</Text>
              </View>
            )}
          </View>
          <Text style={[s.durLabel, { color: conflicted ? C.salmon : C.textSec }]}>
            {event.isAllDay ? 'All day' : durLabel}
          </Text>
        </View>

        {/* Time row */}
        {!event.isAllDay && (
          <Text style={s.eventTime}>
            {fmtTime(event.startTime)} – {fmtTime(event.endTime)}
          </Text>
        )}

        {/* Expanded details */}
        {expanded && (
          <View style={s.eventDetails}>
            {!!event.location && (
              <Text style={s.eventDetailRow}>📍 {event.location}</Text>
            )}
            {event.attendees.length > 0 && (
              <Text style={s.eventDetailRow} numberOfLines={2}>
                👥 {event.attendees.slice(0, 5).join(', ')}
                {event.attendees.length > 5 ? ` +${event.attendees.length - 5} more` : ''}
              </Text>
            )}
            {!!event.description && (
              <Text style={s.eventDetailRow} numberOfLines={3}>
                📝 {event.description.trim().slice(0, 200)}
              </Text>
            )}
            {!!event.meetLink && (
              <View style={s.meetRow}>
                <Text style={s.meetIcon}>🎥</Text>
                <Text style={s.meetLabel}>Google Meet available</Text>
              </View>
            )}
          </View>
        )}

        {/* Footer: account badge + chevron */}
        <View style={s.eventFooter}>
          {event.accountEmail ? (
            <View style={[s.accountBadge, { backgroundColor: `${accountColor}18`, borderColor: `${accountColor}35` }]}>
              <View style={[s.accountBadgeDot, { backgroundColor: accountColor }]} />
              <Text style={[s.accountBadgeText, { color: accountColor }]} numberOfLines={1}>
                {event.accountEmail}
              </Text>
            </View>
          ) : <View />}
          <Text style={s.chevron}>{expanded ? '▲' : '▾'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Conflict summary banner ───────────────────────────────────────────────────
function ConflictBanner({ conflicts }: { conflicts: ConflictPair[] }) {
  if (conflicts.length === 0) return null;
  return (
    <View style={s.conflictBanner}>
      <View style={s.conflictBannerLeft}>
        <Text style={s.conflictBannerIcon}>⚠️</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.conflictBannerTitle}>
            {conflicts.length} Meeting Conflict{conflicts.length > 1 ? 's' : ''} Detected
          </Text>
          {conflicts.map((c, i) => (
            <Text key={i} style={s.conflictBannerSub} numberOfLines={1}>
              • {c.a.title}  ↔  {c.b.title}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({
  googleAccounts,
  outlookAccounts,
  daysAhead,
}: {
  googleAccounts: string[];
  outlookAccounts: string[];
  daysAhead: number;
}) {
  const totalAccounts = googleAccounts.length + outlookAccounts.length;
  return (
    <View style={s.emptyWrap}>
      <Text style={s.emptyIcon}>🗓</Text>
      <Text style={s.emptyTitle}>All clear</Text>
      <Text style={s.emptySub}>
        No meetings scheduled in the next {daysAhead} days
      </Text>

      {/* Show connected accounts so user knows the calendar was checked */}
      {totalAccounts > 0 && (
        <View style={s.emptyAccountsBox}>
          <Text style={s.emptyAccountsLabel}>CALENDARS CHECKED</Text>

          {googleAccounts.map(email => (
            <View key={email} style={s.emptyAccountRow}>
              <View style={[s.emptyAccountDot, { backgroundColor: '#4285F4' }]} />
              <Text style={s.emptyAccountText} numberOfLines={1}>{email}</Text>
              <View style={s.emptyAccountBadge}>
                <Text style={s.emptyAccountBadgeText}>Google</Text>
              </View>
            </View>
          ))}

          {outlookAccounts.map(email => (
            <View key={email} style={s.emptyAccountRow}>
              <View style={[s.emptyAccountDot, { backgroundColor: OUTLOOK_COLOR }]} />
              <Text style={s.emptyAccountText} numberOfLines={1}>{email}</Text>
              <View style={[s.emptyAccountBadge, { backgroundColor: `${OUTLOOK_COLOR}20`, borderColor: `${OUTLOOK_COLOR}40` }]}>
                <Text style={[s.emptyAccountBadgeText, { color: OUTLOOK_COLOR }]}>Outlook</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Bottom Tab Bar ────────────────────────────────────────────────────────────
function TabBar({ active, onTab }: { active: string; onTab: (s: any) => void }) {
  const tabs = [
    { screen: 'home',        emoji: '⌂',  label: 'Home'    },
    { screen: 'obligations', emoji: '📋', label: 'Tasks'   },
    { screen: 'buddy',       emoji: '◎',  label: 'Buddy'   },
    { screen: 'insights',    emoji: '◈',  label: 'Insights'},
  ];
  return (
    <View style={tab.bar}>
      {tabs.map(t => (
        <TouchableOpacity key={t.screen} style={tab.item} onPress={() => onTab(t.screen)}>
          <Text style={[tab.emoji, active === t.screen && { opacity: 1 }]}>{t.emoji}</Text>
          <Text style={[tab.label, active === t.screen && { color: C.verdigris }]}>{t.label}</Text>
          {active === t.screen && <View style={tab.dot} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}
const tab = StyleSheet.create({
  bar:   { flexDirection: 'row', backgroundColor: '#0A0A0A', borderTopWidth: 1, borderColor: C.border, paddingBottom: 20, paddingTop: 10 },
  item:  { flex: 1, alignItems: 'center', gap: 3 },
  emoji: { fontSize: 20, opacity: 0.5 },
  label: { fontSize: 10, color: C.textTer, fontWeight: '500' },
  dot:   { width: 4, height: 4, borderRadius: 2, backgroundColor: C.verdigris, marginTop: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function CalendarScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const [allEvents,   setAllEvents]   = useState<CalendarEvent[]>([]);
  const [conflicts,   setConflicts]   = useState<ConflictPair[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [daysAhead,   setDaysAhead]   = useState(7);
  const [accounts,         setAccounts]         = useState<string[]>([]);   // Google
  const [outlookAccts,     setOutlookAccts]     = useState<string[]>([]);   // Outlook
  const [activeAcct,       setActiveAcct]       = useState<string>('all');  // 'all' or email

  const fadeIn = useRef(new Animated.Value(0)).current;

  // Load all connected accounts on mount
  useEffect(() => {
    getAllGoogleAccounts().then(setAccounts);
    setOutlookAccts(getAllOutlookAccounts());
  }, []);

  const load = useCallback(async (days = daysAhead, quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const result = await fetchAllAccountsEvents(days);
      setAllEvents(result);
      // simple conflict detection across all events
      const sorted = [...result].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      const pairs: ConflictPair[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i], b = sorted[i + 1];
        if (!a.isAllDay && !b.isAllDay && a.endTime > b.startTime) {
          pairs.push({ a, b });
        }
      }
      setConflicts(pairs);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load calendar events.');
    }
    setLoading(false);
    setRefreshing(false);
    Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [daysAhead]);

  useEffect(() => { load(); }, []);

  const onRefresh = () => { setRefreshing(true); load(daysAhead, true); };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const changeDays = (d: number) => { setDaysAhead(d); load(d); };

  // Filter events by active account tab
  const events = activeAcct === 'all'
    ? allEvents
    : allEvents.filter(e => e.accountEmail === activeAcct);

  const groups = groupByDay(events);
  const todayCount = events.filter(e => isToday(e.startTime)).length;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={nav.goBack} style={s.backBtn}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>My Schedule</Text>
            <Text style={s.headerSub}>
              {loading ? 'Loading…' : `${events.length} meetings · ${accounts.length + outlookAccts.length} account${(accounts.length + outlookAccts.length) !== 1 ? 's' : ''} · ${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          {/* Today badge */}
          {todayCount > 0 && !loading && (
            <View style={s.todayBadge}>
              <Text style={s.todayBadgeText}>{todayCount} today</Text>
            </View>
          )}
        </View>

        {/* ── Account filter tabs ────────────────────────────────────────── */}
        {(accounts.length + outlookAccts.length) > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.acctFilterScroll}
            contentContainerStyle={s.acctFilterRow}
          >
            {/* All tab */}
            <TouchableOpacity
              style={[s.acctTab, activeAcct === 'all' && s.acctTabActive]}
              onPress={() => setActiveAcct('all')}
              activeOpacity={0.8}
            >
              <Text style={[s.acctTabText, activeAcct === 'all' && s.acctTabTextActive]}>
                All  ({allEvents.length})
              </Text>
            </TouchableOpacity>

            {/* Google account tabs */}
            {accounts.map(email => {
              const color    = getAccountColor(email, accounts, outlookAccts);
              const count    = allEvents.filter(e => e.accountEmail === email).length;
              const isActive = activeAcct === email;
              return (
                <TouchableOpacity
                  key={email}
                  style={[s.acctTab, { borderColor: isActive ? color : C.border },
                    isActive && { backgroundColor: `${color}20` }]}
                  onPress={() => setActiveAcct(email)}
                  activeOpacity={0.8}
                >
                  <View style={[s.acctTabDot, { backgroundColor: color }]} />
                  <Text style={[s.acctTabText, isActive && { color }]} numberOfLines={1}>
                    {email.split('@')[0]}  ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Outlook account tabs */}
            {outlookAccts.map(email => {
              const color    = OUTLOOK_COLOR;
              const count    = allEvents.filter(e => e.accountEmail === email).length;
              const isActive = activeAcct === email;
              return (
                <TouchableOpacity
                  key={email}
                  style={[s.acctTab, { borderColor: isActive ? color : C.border },
                    isActive && { backgroundColor: `${color}20` }]}
                  onPress={() => setActiveAcct(email)}
                  activeOpacity={0.8}
                >
                  <View style={[s.acctTabDot, { backgroundColor: color }]} />
                  <Text style={[s.acctTabText, isActive && { color }]} numberOfLines={1}>
                    {email.split('@')[0]}  ({count})
                  </Text>
                  {/* Outlook pill */}
                  <View style={[s.acctTabOutlookPill]}>
                    <Text style={s.acctTabOutlookText}>M</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Day range selector ─────────────────────────────────────────── */}
        <View style={s.rangeRow}>
          {[{ label: '7d', days: 7 }, { label: '14d', days: 14 }, { label: '30d', days: 30 }].map(r => (
            <TouchableOpacity
              key={r.days}
              style={[s.rangeBtn, daysAhead === r.days && s.rangeBtnActive]}
              onPress={() => changeDays(r.days)}
              activeOpacity={0.8}
            >
              <Text style={[s.rangeBtnText, daysAhead === r.days && s.rangeBtnTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={C.verdigris} size="large" />
          <Text style={s.loadingText}>Fetching your calendar…</Text>
        </View>
      ) : error ? (
        <View style={s.errorWrap}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={s.errorTitle}>Couldn't load calendar</Text>
          <Text style={s.errorSub}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.verdigris}
              colors={[C.verdigris]}
            />
          }
        >
          <Animated.View style={{ opacity: fadeIn }}>

            {/* Conflict banner */}
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <ConflictBanner conflicts={conflicts} />
            </View>

            {events.length === 0 ? (
              <EmptyState
                googleAccounts={accounts}
                outlookAccounts={outlookAccts}
                daysAhead={daysAhead}
              />
            ) : (
              groups.map(([dayKey, dayEvents]) => {
                const dayDate = dayEvents[0].startTime;
                return (
                  <View key={dayKey} style={s.dayGroup}>
                    {/* Day header */}
                    <View style={s.dayHeader}>
                      <LinearGradient
                        colors={isToday(dayDate) ? [C.verdigris, C.chartreuse] : ['transparent', 'transparent']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={s.dayHeaderLine}
                      />
                      <Text style={[
                        s.dayHeaderText,
                        isToday(dayDate) && { color: C.chartreuse },
                      ]}>
                        {dayLabel(dayDate).toUpperCase()}
                        {isToday(dayDate) && (
                          <Text style={s.dayCount}> · {dayEvents.length} meeting{dayEvents.length !== 1 ? 's' : ''}</Text>
                        )}
                      </Text>
                    </View>

                    {/* Events for this day */}
                    {dayEvents.map(ev => (
                      <EventCard
                        key={ev.id}
                        event={ev}
                        conflicted={isConflicted(ev, conflicts)}
                        expanded={expanded.has(ev.id)}
                        onToggle={() => toggleExpand(ev.id)}
                        accountColor={getAccountColor(ev.accountEmail ?? '', accounts, outlookAccts)}
                      />
                    ))}
                  </View>
                );
              })
            )}

          </Animated.View>
        </ScrollView>
      )}

      {/* ── Bottom Tab Bar ───────────────────────────────────────────────────── */}
      <TabBar active="home" onTab={(s) => nav.navigate(s)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8,
  },
  backBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon:   { color: C.white, fontSize: 28, fontWeight: '300', lineHeight: 32 },
  headerTitle:{ color: C.white,   fontSize: 22, fontWeight: '700' },
  headerSub:  { color: C.textSec, fontSize: 12, marginTop: 2 },
  todayBadge: {
    backgroundColor: `${C.chartreuse}22`, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: `${C.chartreuse}44`,
  },
  todayBadgeText: { color: C.chartreuse, fontSize: 12, fontWeight: '700' },

  // ── Account filter tabs
  acctFilterScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: C.border },
  acctFilterRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingHorizontal: 16, paddingVertical: 10,
  },
  acctTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surfaceEl,
  },
  acctTabActive: {},
  acctTabDot:  { width: 7, height: 7, borderRadius: 4 },
  acctTabText: { color: C.textSec, fontSize: 12, fontWeight: '600' },
  acctTabTextActive: { fontWeight: '700' },
  acctTabOutlookPill: {
    backgroundColor: '#0078D420', borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1, marginLeft: 3,
  },
  acctTabOutlookText: { color: '#0078D4', fontSize: 9, fontWeight: '800' },

  // ── Event footer (account badge + chevron)
  eventFooter: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 6,
  },
  accountBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, maxWidth: '80%',
  },
  accountBadgeDot: { width: 5, height: 5, borderRadius: 3 },
  accountBadgeText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.1 },

  // ── Day range tabs
  rangeRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  rangeBtn: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1, borderColor: C.border,
  },
  rangeBtnActive: { backgroundColor: C.verdigris, borderColor: C.verdigris },
  rangeBtnText:   { color: C.textSec, fontSize: 13, fontWeight: '600' },
  rangeBtnTextActive: { color: C.bg },

  // ── Loading / Error
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: C.textSec, fontSize: 14 },
  errorWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorIcon:   { fontSize: 40 },
  errorTitle:  { color: C.white, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  errorSub:    { color: C.textSec, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  retryBtn:    { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, backgroundColor: C.verdigris },
  retryBtnText:{ color: C.bg, fontSize: 14, fontWeight: '700' },

  // ── Empty
  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, marginTop: 60 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { color: C.white, fontSize: 20, fontWeight: '700' },
  emptySub:   { color: C.textSec, fontSize: 14, textAlign: 'center' },
  emptyAccountsBox: {
    marginTop: 20, width: '100%',
    backgroundColor: C.surface, borderRadius: 14,
    padding: 16, gap: 10,
    borderWidth: 1, borderColor: C.border,
  },
  emptyAccountsLabel: {
    color: C.textTer, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4,
  },
  emptyAccountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  emptyAccountDot: { width: 8, height: 8, borderRadius: 4 },
  emptyAccountText: {
    flex: 1, color: C.white, fontSize: 13, fontWeight: '500',
  },
  emptyAccountBadge: {
    backgroundColor: '#4285F420', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: '#4285F440',
  },
  emptyAccountBadgeText: { color: '#4285F4', fontSize: 10, fontWeight: '700' },

  // ── Day groups
  dayGroup: { paddingHorizontal: 16, marginBottom: 8 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 16 },
  dayHeaderLine: { height: 2, width: 28, borderRadius: 2 },
  dayHeaderText: { color: C.textSec, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  dayCount:      { color: C.textTer, fontWeight: '500', letterSpacing: 0 },

  // ── Event card
  eventCard: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  eventCardConflict: {
    borderColor: 'rgba(255,59,48,0.35)',
    backgroundColor: 'rgba(255,59,48,0.05)',
  },
  accentBar: { width: 4, minHeight: '100%' },
  eventBody: { flex: 1, padding: 14, paddingLeft: 12 },
  eventTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  eventTitle: { color: C.white, fontSize: 15, fontWeight: '600', flex: 1, lineHeight: 21 },
  durLabel:   { fontSize: 12, fontWeight: '600', marginTop: 2 },
  eventTime:  { color: C.textSec, fontSize: 12, marginTop: 4, fontWeight: '500' },
  chevron:    { color: C.textTer, fontSize: 12, textAlign: 'right', marginTop: 6 },

  // Conflict badge inline
  conflictBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,59,48,0.18)', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 5,
  },
  conflictDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: C.crimson },
  conflictBadgeText:{ color: C.crimson, fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  // Expanded details
  eventDetails: { marginTop: 12, gap: 6, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
  eventDetailRow: { color: C.textSec, fontSize: 12, lineHeight: 18 },
  meetRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meetIcon:  { fontSize: 14 },
  meetLabel: { color: C.verdigris, fontSize: 12, fontWeight: '600' },

  // ── Conflict banner (top summary)
  conflictBanner: {
    backgroundColor: 'rgba(255,59,48,0.10)',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,59,48,0.25)',
    marginBottom: 4,
  },
  conflictBannerLeft:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  conflictBannerIcon:  { fontSize: 20, marginTop: 1 },
  conflictBannerTitle: { color: C.salmon, fontSize: 13, fontWeight: '700', marginBottom: 5 },
  conflictBannerSub:   { color: C.textSec, fontSize: 11, marginBottom: 2 },
});
