/**
 * Local drafts must belong to the signed-in account.
 *
 * Historically the Video Composer stored its whole draft under a fixed
 * localStorage key. Signing out did not clear it, so signing in with a second
 * account in the same browser resurrected the first account's briefing — it
 * looked like the accounts were merging. Draft keys are now scoped by user id
 * and wiped on sign-out.
 */

const LEGACY_MIGRATED_FLAG = 'local-draft-scope:migrated';

/**
 * Reads the signed-in user id synchronously from the Supabase auth token in
 * localStorage. Synchronous access matters because draft keys are needed
 * during the very first render, before any auth hook has resolved.
 */
export function currentUserIdSync(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const id = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
      if (typeof id === 'string' && id) return id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** `base` scoped to the current account (`anon` while signed out). */
export function scopedDraftKey(base: string): string {
  return `${base}:${currentUserIdSync() ?? 'anon'}`;
}

/**
 * One-time hand-over: an existing pre-scoping draft is adopted by the account
 * that is signed in right now, so nobody loses work in progress.
 */
export function migrateLegacyDraftKey(base: string): void {
  try {
    const userId = currentUserIdSync();
    if (!userId) return;
    if (localStorage.getItem(`${LEGACY_MIGRATED_FLAG}:${base}`)) return;
    const legacy = localStorage.getItem(base);
    localStorage.setItem(`${LEGACY_MIGRATED_FLAG}:${base}`, '1');
    if (legacy === null) return;
    const target = `${base}:${userId}`;
    if (localStorage.getItem(target) === null) localStorage.setItem(target, legacy);
    localStorage.removeItem(base);
  } catch {
    /* ignore */
  }
}

/** Base keys of every draft-like local store in the app. */
const DRAFT_BASE_KEYS = [
  'video-composer-draft',
  'video-composer-draft-tab',
  'video-composer-ad-meta',
  'universal-video-wizard-state',
  'universal-video-consultant-state',
];

const DRAFT_EXACT_KEYS = ['composer_import', 'ai-toolkit-prompt-draft', 'wizardPrompt'];

/** Called on sign-out: no draft of the leaving account may survive locally. */
export function clearAllLocalDrafts(): void {
  try {
    const remove: string[] = [...DRAFT_EXACT_KEYS];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (DRAFT_BASE_KEYS.some((base) => key === base || key.startsWith(`${base}:`))) {
        remove.push(key);
      }
    }
    for (const key of remove) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem('composer_import');
  } catch {
    /* ignore */
  }
}
