/**
 * useWelcomeBonus — deaktiviert (12.09.2026).
 *
 * Es gibt kein Startguthaben mehr für neue Nutzer. Der Hook bleibt als
 * No-Op-Shim erhalten, damit bestehende Consumer nicht crashen.
 */

export const useWelcomeBonus = () => {
  return {
    shouldShow: false,
    loading: false,
    bonusAmount: null as number | null,
    bonusCurrency: null as "EUR" | "USD" | null,
    dismiss: async () => {},
  };
};
