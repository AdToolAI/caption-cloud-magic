

# Fix: Interview hängt sich auf & Antworten verschieben sich

## Problem 1: Aufhängen (CORS)
Die Edge Function `universal-video-consultant` hat die **alten CORS-Headers** (Zeile 4-7). Der Supabase-Client sendet neue Headers, die nicht erlaubt sind — das führt zu stillen Fehlern, die wie ein "Aufhängen" wirken.

## Problem 2: Doppelte Nachrichten
`messageIdsRef` wird nur mit `['1']` initialisiert (Zeile 82) — nach einem Page-Refresh kennt es die alten IDs nicht. Dadurch entstehen Duplikate, die die Phase-Berechnung im Backend verschieben.

## Umsetzung

### Schritt 1: CORS-Headers in `universal-video-consultant` erweitern
Gleicher Fix wie bei den anderen Funktionen — erweiterte Headers hinzufügen.

**Datei:** `supabase/functions/universal-video-consultant/index.ts` (Zeile 4-7)

### Schritt 2: `messageIdsRef` aus localStorage initialisieren
Beim Component-Mount die IDs aller persistierten Messages laden, damit nach Refresh keine Duplikate entstehen.

**Datei:** `src/components/universal-video-creator/UniversalVideoConsultant.tsx` (Zeile 82)

### Schritt 3: Duplikate vor API-Call filtern
Vor dem Senden an die Edge Function die Messages-Liste nach Role+Content deduplizieren.

**Datei:** `src/components/universal-video-creator/UniversalVideoConsultant.tsx` (in `sendMessage`, Zeile 133-141)

### Schritt 4: Quick-Reply Doppelklick verhindern
Quick-Reply-Buttons sofort nach erstem Klick disablen, nicht erst wenn `isLoading` gesetzt wird.

**Datei:** `src/components/universal-video-creator/UniversalVideoConsultant.tsx` (in `handleQuickReply`)

## Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `supabase/functions/universal-video-consultant/index.ts` | CORS-Headers erweitern |
| `src/components/universal-video-creator/UniversalVideoConsultant.tsx` | Dedup-Init, Message-Filter, Doppelklick-Schutz |

