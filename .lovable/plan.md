# Kostenvorschau angleichen + Provider-Überlast sauber behandeln

UI-Vereinfachung bleibt draußen. Zwei Themen: (1) die falsch angezeigte Kostenvorschau, (2) die „Überlast"-Fehler von Veo.

## Woher kommt die Provider-Überlast?

Sie hat nichts mit unserer Auslastung zu tun. Der Fehler `code: 8` (RESOURCE_EXHAUSTED / „high load") kommt von Google Veo über Replicate — das ist die **globale** Kapazität des Modellanbieters, geteilt mit allen Replicate-Kunden weltweit. Bei einem einzelnen Testkunden kann das genauso auftreten wie bei tausend.

Wichtig: Im Code (`generate-veo-video`) wird nur ein Fehler **beim Anlegen** der Prediction abgefangen und sofort erstattet. Der Screenshot-Fall tritt später auf — die Prediction läuft an und stirbt beim Provider. Dieser Pfad hat aktuell keinen Wiederholversuch, nur die nachgelagerte Erstattung.

## Was gebaut wird

### 1. Kostenvorschau = tatsächliche Abbuchung
- Die Vorschau nutzt den zentralen Katalog (`pricing-catalog`), fällt aber bei Ladefehler still auf lokale, teilweise veraltete Preistabellen in `src/config/*VideoCredits.ts` zurück — genau da entsteht die Abweichung.
- Fix: Wenn der Katalog nicht geladen ist, wird kein „harter" Preis mehr angezeigt, sondern ein Ladezustand bzw. ein Hinweis „Preis wird geprüft"; der Bestätigen-Button wartet auf den Katalogpreis.
- Zusätzlich ein Abgleichs-Test, der lokale Config-Preise gegen den Katalog prüft, damit Abweichungen künftig auffallen statt still angezeigt zu werden.
- In der Bestätigung wird klar zwischen „geschätzt" (variable Dauer/Modelle) und „fix" unterschieden, plus Hinweis auf automatische Rückerstattung bei Differenz.

### 2. Provider-Überlast
- Ein begrenzter Wiederholversuch (max. 2, mit Backoff) für Überlast-Fehler beim Anlegen der Generierung — ohne doppelte Abbuchung.
- Für Fehler nach dem Start: klare Meldung „Der Videoanbieter ist derzeit überlastet — dein Guthaben wurde zurückerstattet, bitte in ein paar Minuten erneut versuchen" (DE/EN/ES) statt Roh-JSON, plus vorbefüllter „Erneut versuchen"-Button. (Meldungsteil ist bereits umgesetzt; hier kommt die Verifikation der Erstattung dazu.)
- Prüfung, ob jede fehlgeschlagene Veo-Generierung tatsächlich eine Erstattungsbuchung hat; fehlende Fälle werden nachgezogen.

## Technische Details
- Frontend: `src/hooks/useVideoPricingCatalog.ts`, `src/components/ai-video/AIVideoCostConfirmDialog.tsx`, aufrufende Studios (Toolkit/Composer), `src/config/*VideoCredits.ts` nur noch als Notfall-Fallback mit sichtbarer Kennzeichnung.
- Backend: `supabase/functions/generate-veo-video/index.ts` (Retry bei Überlast, Fehlercode `PROVIDER_OVERLOADED`), `check-video-status` (Erstattungspfad prüfen).
- Keine Änderungen an Lip-Sync, Motion Studio oder den eingefrorenen V5xx-Pfaden.

## Verifikation
- Vergleichstest lokale Configs ↔ `pricing-catalog`.
- Manueller Durchlauf: Vorschau-Betrag vs. tatsächliche Wallet-Bewegung bei einer günstigen Generierung.
- Prüfung der letzten fehlgeschlagenen Generierungen auf vollständige Erstattung.
