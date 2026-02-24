import type { AppState } from '../types';
import { mergeParsedState, store } from '../store';
import { supabase, isSupabaseConfigured } from './supabase';

const SAVE_DEBOUNCE_MS = 1500;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingState: AppState | null = null;

/**
 * Load state from Supabase when signed in. Returns null if not configured,
 * no session, no row, or error (caller should use getInitialState() or local).
 */
export async function loadFromSupabase(): Promise<AppState | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data, error } = await supabase
    .from('user_state')
    .select('state')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error || !data?.state) return null;
  return mergeParsedState(data.state as Partial<AppState>);
}

/**
 * Save state to Supabase (debounced). Call whenever state changes while signed in.
 * Also writes to localStorage as backup.
 */
export function saveToSupabase(state: AppState): void {
  store.save(state); // always backup to local
  if (!isSupabaseConfigured() || !supabase) return;
  pendingState = state;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    saveTimeout = null;
    const toSave = pendingState;
    pendingState = null;
    const client = supabase;
    if (!toSave || !client) return;
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user?.id) return;
    await client.from('user_state').upsert(
      {
        id: session.user.id,
        state: toSave,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
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
