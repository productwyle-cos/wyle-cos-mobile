// src/services/snapshotService.ts
// Tracks "start of day" obligation state so the evening brief can show
// exactly what was completed vs still pending during the day.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { UIObligation } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ObligationSnap {
  id:       string;
  title:    string;
  emoji:    string;
  risk:     'high' | 'medium' | 'low';
  type:     string;
  amount:   number | null;
  daysUntil: number;
}

export interface DaySnapshot {
  date:        string;           // "2026-03-27"
  takenAt:     string;           // ISO timestamp
  obligations: ObligationSnap[]; // active obligations at start of day
}

export interface DayProgress {
  snapshotExists:   boolean;
  totalAtStart:     number;
  completedToday:   ObligationSnap[];   // were active this morning, now completed
  stillPending:     ObligationSnap[];   // were active this morning, still active
  addedToday:       ObligationSnap[];   // not in morning snapshot (new today)
  completedCount:   number;
  pendingCount:     number;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function todayKey(): string {
  return `wyle_day_snapshot_${new Date().toISOString().split('T')[0]}`;
}

function toSnap(o: UIObligation): ObligationSnap {
  return {
    id:        o._id,
    title:     o.title,
    emoji:     o.emoji ?? '📄',
    risk:      o.risk,
    type:      o.type,
    amount:    o.amount ?? null,
    daysUntil: o.daysUntil,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call this when the morning brief is generated (or first open of the day).
 * Saves a snapshot of every currently-active obligation.
 * Safe to call multiple times — if a snapshot already exists for today it is
 * NOT overwritten (we want the first-open-of-day state, not mid-day state).
 */
export async function saveMorningSnapshot(
  obligations: UIObligation[],
): Promise<void> {
  const key = todayKey();
  try {
    const existing = await AsyncStorage.getItem(key);
    if (existing) return; // already saved for today — don't overwrite

    const active = obligations.filter(o => o.status === 'active' || o.status !== 'completed');
    const snapshot: DaySnapshot = {
      date:        new Date().toISOString().split('T')[0],
      takenAt:     new Date().toISOString(),
      obligations: active.map(toSnap),
    };
    await AsyncStorage.setItem(key, JSON.stringify(snapshot));

    // Clean up snapshots older than 7 days
    await pruneOldSnapshots();
  } catch (e) {
    console.warn('[snapshot] save failed:', e);
  }
}

/**
 * Returns today's morning snapshot, or null if none was saved yet.
 */
export async function getTodaySnapshot(): Promise<DaySnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(todayKey());
    return raw ? (JSON.parse(raw) as DaySnapshot) : null;
  } catch {
    return null;
  }
}

/**
 * Compares the morning snapshot against the current obligations list and
 * returns a structured DayProgress object for the evening brief.
 */
export async function getDayProgress(
  currentObligations: UIObligation[],
): Promise<DayProgress> {
  const snapshot = await getTodaySnapshot();

  if (!snapshot) {
    // No morning snapshot — user didn't open the app this morning.
    // Fall back to showing tasks completed today using completedAt heuristic
    // (anything marked completed today counts).
    const today = new Date().toISOString().split('T')[0];
    const completedToday = currentObligations
      .filter(o => o.status === 'completed')
      .map(toSnap);
    const stillPending = currentObligations
      .filter(o => o.status !== 'completed')
      .map(toSnap);

    return {
      snapshotExists: false,
      totalAtStart:   currentObligations.length,
      completedToday,
      stillPending,
      addedToday:     [],
      completedCount: completedToday.length,
      pendingCount:   stillPending.length,
    };
  }

  const morningIds = new Set(snapshot.obligations.map(s => s.id));
  const currentIds = new Set(currentObligations.map(o => o._id));

  // Was in morning snapshot AND is now completed → completed today
  const completedToday = snapshot.obligations.filter(snap => {
    const current = currentObligations.find(o => o._id === snap.id);
    return current?.status === 'completed';
  });

  // Was in morning snapshot AND still NOT completed → still pending
  const stillPending = snapshot.obligations.filter(snap => {
    const current = currentObligations.find(o => o._id === snap.id);
    return !current || current.status !== 'completed';
  });

  // In current obligations but NOT in morning snapshot → added today
  const addedToday = currentObligations
    .filter(o => !morningIds.has(o._id) && o.status !== 'completed')
    .map(toSnap);

  return {
    snapshotExists: true,
    totalAtStart:   snapshot.obligations.length,
    completedToday,
    stillPending,
    addedToday,
    completedCount: completedToday.length,
    pendingCount:   stillPending.length,
  };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function pruneOldSnapshots(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const snapshotKeys = allKeys.filter(k => k.startsWith('wyle_day_snapshot_'));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const toDelete = snapshotKeys.filter(k => {
      const dateStr = k.replace('wyle_day_snapshot_', '');
      return new Date(dateStr) < cutoff;
    });

    if (toDelete.length > 0) {
      await AsyncStorage.multiRemove(toDelete);
    }
  } catch { /* non-critical */ }
}
