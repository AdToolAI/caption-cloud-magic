# Befund zum "verpixelten" 4K-Video und was daraus folgt

## Gemessen (Konto yaxac88729@watchyio.com)

| Datei | Auflösung | Datenrate | Größe |
|---|---|---|---|
| Ausgangsvideo im Konto | 1080×1920 | 12,0 Mbit/s | 25,8 MB |
| ByteDance-Ergebnis im Konto (Lauf vom 06.09., 09:01) | **2160×3840** | 21,1 Mbit/s | 45,4 MB |
| Die hier hochgeladene Datei | **360×640** | 0,5 Mbit/s | 1,15 MB |

Das Ergebnis im Konto ist also echtes Hochkant-4K. Die hochgeladene Datei ist
nicht dieselbe Datei: sie ist der über WhatsApp verschickte Abzug, den WhatsApp
auf 360×640 heruntergerechnet hat — 36-fach weniger Bildpunkte. Daher der
verpixelte Eindruck.

Zusätzlich geprüft: an drei Stellen (3 s, 8 s, 14 s) wurde das 4K-Ergebnis auf
Quellgröße zurückgerechnet und mit dem Ausgangsbild verglichen. Der Detailwert
liegt überall über der Quelle (5,0 vs. 4,3 / 8,1 vs. 7,0 / 6,1 vs. 4,4) — es
wurde also tatsächlich Schärfe hinzugewonnen, nicht nur vergrößert.

## Was gebaut wird

### 1. Nachmessung sichtbar machen
Die Felder für die tatsächliche Ausgabegröße sind bei allen bisherigen Läufen
leer. Nach jedem Lauf werden Auflösung, Datenrate, Verfahren und Dateigröße an
der fertigen Datei gemessen, gespeichert und im Ergebnisblock angezeigt
("1080×1920 → 2160×3840, 21 Mbit/s"). Damit ist bei jeder künftigen Rückfrage
ohne Nachforschung belegt, was geliefert wurde.

### 2. Weitergabe-Hinweis
Direkt am fertigen Ergebnis steht ein kurzer Hinweis: Messenger wie WhatsApp
rechnen Videos beim Versenden stark herunter; für die volle Qualität die Datei
herunterladen bzw. als Datei/Dokument versenden. Dazu ein "Herunterladen"-Knopf
am Ergebnis. Texte in EN/DE/ES.

## Technische Details

- `supabase/functions/video-enhance/index.ts`: nach dem Persistieren
  `probeRemoteVideo` auf die Ausgabedatei; Schreiben von `actual_width`,
  `actual_height`, `projection_matched` sowie Codec/Datenrate/Größe auf die
  Run-Zeile. Nachrüstung der bereits abgeschlossenen Läufe per einmaligem
  Backfill-Aufruf.
- `src/components/ai-video/EnhanceVideoPanel.tsx`: Ergebnisblock mit gemessenen
  Werten, Download-Knopf, Messenger-Hinweis; Texte über `useTx` in EN/DE/ES.
- Unangetastet: Preislogik, Deckel, Gutschrift, Wallet, Provideraufrufe,
  Director's Cut, Lip-Sync.
