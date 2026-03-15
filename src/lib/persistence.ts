import type { AppState } from '../types';
import { mergeParsedState, store } from '../store';
import { supabase, isSupabaseConfigured } from './supabase';

const SAVE_DEBOUNCE_MS = 1500;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingState: AppState | null = null;

export interface CloudLoadResult {
  state: AppState;
  cloudSavedAt: number;
}

/**
 * Load state from Supabase when signed in. Returns null if not configured,
 * no session, no row, or error (caller should use getInitialState() or local).
 */
export async function loadFromSupabase(): Promise<CloudLoadResult | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data, error } = await supabase
    .from('user_state')
    .select('state, updated_at')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error || !data?.state) return null;
  const cloudSavedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
  return { state: mergeParsedState(data.state as Partial<AppState>), cloudSavedAt };
}

/**
 * Save state to Supabase (debounced). Call whenever state changes while signed in.
 * Also writes to localStorage as backup.
 */
export function saveToSupabase(state: AppState): void {
  store.save(state);
  if (!isSupabaseConfigured() || !supabase) return;
  pendingState = state;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    saveTimeout = null;
    const toSave = pendingState;
    pendingState = null;
    const client = supabase;
    if (!toSave || !client) return;
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session?.user?.id) return;
      const { error } = await client.from('user_state').upsert(
        {
          id: session.user.id,
          state: toSave,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      if (error) {
        console.error('[LifePlanner] Supabase save failed:', error.message);
      }
    } catch (err) {
      console.error('[LifePlanner] Supabase save error:', err);
    }
  }, SAVE_DEBOUNCE_MS);
}

/** Load from localStorage (sync). */
export function loadLocal(): AppState {
  return store.load();
}

/** Save to localStorage only (sync). */
export function saveLocal(state: AppState): void {
  store.save(state);
}

/** Timestamp of last local save (epoch ms). */
export function getLocalSavedAt(): number {
  return store.getLocalSavedAt();
}
