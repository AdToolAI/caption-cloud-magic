/**
 * Öffnet eine Stripe-Checkout-URL.
 *
 * Bisher wurde immer `window.open(url, "_blank")` genutzt. Blockiert der
 * Browser das Popup, passierte für den Kunden sichtbar gar nichts. Deshalb
 * fällt diese Hilfsfunktion auf eine Navigation im selben Tab zurück.
 */
export function openCheckoutUrl(url: string): void {
  if (!url) return;
  let win: Window | null = null;
  try {
    win = window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    win = null;
  }
  if (!win || win.closed || typeof win.closed === "undefined") {
    window.location.href = url;
  }
}
