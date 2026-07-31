/**
 * useCredits — No-Op (Beta 2026).
 *
 * Das alte generische Credit-System wurde mit Launch des Beta-Basic-Abos
 * (14,99 €) abgeschafft. Alle App-Features (Chat, Edge Functions, Automation,
 * Publishing …) sind im Abo enthalten. Nur AI-Video / Music / Bild-
 * Generierung wird über `ai_video_wallets` separat abgerechnet
 * (siehe `useAIVideoWallet`).
 *
 * Dieser Hook bleibt als leerer Shim erhalten, damit bestehende Consumer
 * (~15 Dateien) nicht crashen. Er liefert einen konstanten "Beta-Basic"-
 * Kontostand ohne DB-Zugriff.
 */

export interface CreditBalance {
  balance: number;
  plan_code: string;
  monthly_credits: number;
  last_reset_at: string;
}

const NOOP_BALANCE: CreditBalance = {
  balance: Number.POSITIVE_INFINITY,
  plan_code: 'basic',
  monthly_credits: 0,
  last_reset_at: new Date(0).toISOString(),
};

export const useCredits = () => {
  return {
    balance: NOOP_BALANCE,
    loading: false,
    error: null as string | null,
    refetch: async () => {},
  };
};
