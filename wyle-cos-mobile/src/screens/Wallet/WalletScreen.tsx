// src/screens/Wallet/WalletScreen.tsx
// Document Wallet — lists all documents the user has scanned and uploaded to
// their own Google Drive via Wyle. Each card shows extracted metadata.
// Documents are stored in a "Wyle Documents" folder in the user's Drive.

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Linking, RefreshControl,
  Dimensions, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAccessToken, isGoogleConnected } from '../../services/googleAuthService';
import { listWyleDocs, deleteWyleDoc, WyleDriveDoc } from '../../services/driveService';
import type { NavProp } from '../../../app/index';

const { width } = Dimensions.get('window');

const C = {
  bg:         '#0D0D0D',
  surface:    '#161616',
  surfaceEl:  '#1E1E1E',
  surfaceHi:  '#252525',
  verdigris:  '#1B998B',
  chartreuse: '#D5FF3F',
  salmon:     '#FF6B6B',
  crimson:    '#FF3B30',
  orange:     '#FF9500',
  white:      '#FFFFFF',
  textSec:    '#9A9A9A',
  textTer:    '#555555',
  border:     '#2A2A2A',
};

// ── Document type → icon + colour ────────────────────────────────────────────
const DOC_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  passport:         { icon: '🛂', color: '#4A90D9', label: 'Passport' },
  emirates_id:      { icon: '🪪', color: '#7B61FF', label: 'Emirates ID' },
  national_id:      { icon: '🪪', color: '#7B61FF', label: 'National ID' },
  visa:             { icon: '✈️', color: '#1B998B', label: 'Visa' },
  driving_license:  { icon: '🚗', color: '#FF9500', label: 'Driving License' },
  insurance_policy: { icon: '🛡️', color: '#34C759', label: 'Insurance' },
  invoice:          { icon: '📄', color: '#FF6B6B', label: 'Invoice' },
  receipt:          { icon: '🧾', color: '#FF9500', label: 'Receipt' },
  bank_statement:   { icon: '🏦', color: '#4A90D9', label: 'Bank Statement' },
  other:            { icon: '📎', color: '#9A9A9A', label: 'Document' },
};

function getDocConfig(type: string) {
  return DOC_CONFIG[type] ?? DOC_CONFIG.other;
}

// ── Expiry badge helper ───────────────────────────────────────────────────────
function getExpiryInfo(dates: WyleDriveDoc['dates']): {
  label: string; daysLeft: number | null; color: string
} {
  const expiryDate = dates.find(d =>
    d.label.toLowerCase().includes('expir') ||
    d.label.toLowerCase().includes('valid') ||
    d.label.toLowerCase().includes('due')
  );
  if (!expiryDate) return { label: '', daysLeft: null, color: C.textTer };

  const parsed = new Date(expiryDate.date_string);
  if (isNaN(parsed.getTime())) return { label: expiryDate.date_string, daysLeft: null, color: C.textTer };

  const daysLeft = Math.ceil((parsed.getTime() - Date.now()) / 86400000);
  const color = daysLeft <= 7 ? C.crimson : daysLeft <= 30 ? C.orange : daysLeft <= 90 ? '#FFD60A' : C.verdigris;
  const label = daysLeft < 0
    ? 'Expired'
    : daysLeft === 0
    ? 'Expires today'
    : daysLeft <= 90
    ? `Expires in ${daysLeft}d`
    : parsed.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });

  return { label, daysLeft, color };
}

// ── Filter tabs ───────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'id',       label: 'IDs' },
  { key: 'finance',  label: 'Finance' },
  { key: 'travel',   label: 'Travel' },
  { key: 'other',    label: 'Other' },
];

const FILTER_TYPES: Record<string, string[]> = {
  id:      ['passport', 'emirates_id', 'national_id', 'driving_license'],
  finance: ['invoice', 'receipt', 'bank_statement', 'insurance_policy'],
  travel:  ['visa', 'passport'],
};

// ── Doc Card ─────────────────────────────────────────────────────────────────
function DocCard({
  doc,
  onDelete,
}: {
  doc: WyleDriveDoc;
  onDelete: (doc: WyleDriveDoc) => void;
}) {
  const cfg    = getDocConfig(doc.documentType);
  const expiry = getExpiryInfo(doc.dates);
  const uploadedDate = new Date(doc.uploadedAt).toLocaleDateString('en-AE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const handleOpen = () => {
    if (doc.webViewLink) {
      Linking.openURL(doc.webViewLink).catch(() =>
        Alert.alert('Error', 'Could not open document in Google Drive.')
      );
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Remove Document',
      `Remove "${doc.title}" from your Wallet? It will also be deleted from your Google Drive.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => onDelete(doc) },
      ]
    );
  };

  return (
    <TouchableOpacity style={card.wrap} activeOpacity={0.85} onPress={handleOpen}>
      {/* Icon */}
      <View style={[card.iconWrap, { backgroundColor: `${cfg.color}18`, borderColor: `${cfg.color}30` }]}>
        <Text style={card.icon}>{cfg.icon}</Text>
      </View>

      {/* Content */}
      <View style={card.content}>
        <View style={card.titleRow}>
          <Text style={card.title} numberOfLines={1}>{doc.title}</Text>
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={card.deleteBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={[card.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>

        {doc.vendor ? (
          <Text style={card.meta} numberOfLines={1}>🏢 {doc.vendor}</Text>
        ) : null}
        {doc.personName ? (
          <Text style={card.meta} numberOfLines={1}>👤 {doc.personName}</Text>
        ) : null}
        {doc.reference ? (
          <Text style={card.meta} numberOfLines={1}>🔖 {doc.reference}</Text>
        ) : null}

        {/* Amounts */}
        {doc.amounts?.length > 0 && (
          <View style={card.amountRow}>
            {doc.amounts.slice(0, 2).map((a, i) => (
              <View key={i} style={card.amountBadge}>
                <Text style={card.amountText}>💰 {a.currency} {a.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Expiry / date */}
        <View style={card.footer}>
          {expiry.label ? (
            <View style={[card.expiryBadge, { backgroundColor: `${expiry.color}18`, borderColor: `${expiry.color}35` }]}>
              <Text style={[card.expiryText, { color: expiry.color }]}>📅 {expiry.label}</Text>
            </View>
          ) : null}
          <Text style={card.uploadedAt}>Scanned {uploadedDate}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const card = StyleSheet.create({
  wrap: {
    flexDirection: 'row', gap: 14,
    backgroundColor: C.surface,
    borderRadius: 16, padding: 14,
    marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  icon:      { fontSize: 26 },
  content:   { flex: 1, gap: 4 },
  titleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:     { color: C.white, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  deleteBtn: { color: C.textTer, fontSize: 14, fontWeight: '600' },
  typeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  meta:      { color: C.textSec, fontSize: 12, marginTop: 1 },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  amountBadge: {
    backgroundColor: `${C.verdigris}14`,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: `${C.verdigris}28`,
  },
  amountText:  { color: C.verdigris, fontSize: 12, fontWeight: '600' },
  footer:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  expiryBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  expiryText:  { fontSize: 11, fontWeight: '700' },
  uploadedAt:  { color: C.textTer, fontSize: 10 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function WalletScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const [docs, setDocs]         = useState<WyleDriveDoc[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [connected, setConnected] = useState(false);

  const loadDocs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { connected: isConnected } = await isGoogleConnected();
      setConnected(isConnected);
      if (!isConnected) return;

      const token = await getAccessToken();
      if (!token) return;

      const list = await listWyleDocs(token);
      setDocs(list);
    } catch (e: any) {
      console.warn('[Wallet] Load error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload every time the tab is focused
  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleDelete = async (doc: WyleDriveDoc) => {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not signed in');
      await deleteWyleDoc(doc.fileId, doc.metaId, token);
      setDocs(prev => prev.filter(d => d.metaId !== doc.metaId));
    } catch (e: any) {
      Alert.alert('Error', `Could not delete document: ${e.message}`);
    }
  };

  // Filter docs
  const filteredDocs = activeFilter === 'all'
    ? docs
    : docs.filter(d => (FILTER_TYPES[activeFilter] ?? []).includes(d.documentType));

  // ── Not connected state ───────────────────────────────────────────────────
  if (!loading && !connected) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <SafeAreaView edges={['top']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔐</Text>
          <Text style={s.emptyTitle}>Connect Google to access your Wallet</Text>
          <Text style={s.emptySub}>
            Your documents are stored securely in your own Google Drive.
            Connect your account to view them here.
          </Text>
          <TouchableOpacity
            style={s.connectBtn}
            onPress={() => nav.navigate('connect' as any)}
          >
            <Text style={s.connectBtnText}>Connect Google Account</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Document Wallet</Text>
            <Text style={s.headerSub}>
              {docs.length > 0
                ? `${docs.length} document${docs.length === 1 ? '' : 's'} · stored in your Google Drive`
                : 'Your scanned documents live here'}
            </Text>
          </View>
          <TouchableOpacity style={s.driveBtn} onPress={() =>
            Linking.openURL('https://drive.google.com').catch(() => {})
          }>
            <Text style={s.driveBtnText}>📁 Drive</Text>
          </TouchableOpacity>
        </View>

        {/* Filter tabs */}
        <View style={s.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterTab, activeFilter === f.key && s.filterTabActive]}
              onPress={() => setActiveFilter(f.key)}
            >
              <Text style={[s.filterTabText, activeFilter === f.key && s.filterTabTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={C.verdigris} size="large" />
            <Text style={s.loadingText}>Loading your documents...</Text>
          </View>
        ) : filteredDocs.length === 0 ? (
          <View style={s.center}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>
              {activeFilter === 'all' ? '📂' : '🔍'}
            </Text>
            <Text style={s.emptyTitle}>
              {activeFilter === 'all' ? 'No documents yet' : `No ${activeFilter} documents`}
            </Text>
            <Text style={s.emptySub}>
              {activeFilter === 'all'
                ? 'Scan a document in the Buddy chat using the + button and Buddy will save it here automatically.'
                : 'Try switching to "All" or scan a new document.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredDocs}
            keyExtractor={d => d.metaId}
            renderItem={({ item }) => (
              <DocCard doc={item} onDelete={handleDelete} />
            )}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadDocs(true)}
                tintColor={C.verdigris}
              />
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
  },
  headerTitle: { color: C.white, fontSize: 24, fontWeight: '800' },
  headerSub:   { color: C.textSec, fontSize: 12, marginTop: 2 },
  driveBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, backgroundColor: C.surfaceEl,
    borderWidth: 1, borderColor: C.border,
  },
  driveBtnText: { color: C.textSec, fontSize: 13, fontWeight: '600' },

  filterRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingBottom: 14,
  },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, backgroundColor: C.surfaceEl,
    borderWidth: 1, borderColor: C.border,
  },
  filterTabActive: {
    backgroundColor: C.verdigris, borderColor: C.verdigris,
  },
  filterTabText:       { color: C.textSec, fontSize: 13, fontWeight: '600' },
  filterTabTextActive: { color: C.white },

  list:   { paddingHorizontal: 20, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  emptyTitle: {
    color: C.white, fontSize: 18, fontWeight: '700',
    textAlign: 'center', marginBottom: 10,
  },
  emptySub: {
    color: C.textSec, fontSize: 14, textAlign: 'center', lineHeight: 21,
  },

  connectBtn: {
    marginTop: 24, backgroundColor: C.verdigris,
    borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14,
  },
  connectBtnText: { color: C.white, fontSize: 15, fontWeight: '700' },

  loadingText: { color: C.textSec, fontSize: 14, marginTop: 12 },
});
