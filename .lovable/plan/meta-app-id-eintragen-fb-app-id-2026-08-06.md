# Meta App-ID eintragen (`fb:app_id`)

Du hast die ID bestätigt: **1769514810345813** — sie stimmt mit dem bereits im Projekt hinterlegten Wert überein. Sie ist eine öffentliche Kennung (steht ohnehin in jedem Facebook-Login-Aufruf im Browser); geheim ist nur das App-Secret. Ein Secret-Formular ist dafür also nicht nötig — und für Meta sogar hinderlich, weil der Crawler kein JavaScript und keine Secrets lesen kann.

## Umsetzung

**1. `fb:app_id` statisch in den Head**
In `index.html` bei den Open-Graph-Tags:
`<meta property="fb:app_id" content="1769514810345813" />`
Damit verschwindet die Sharing-Debugger-Warnung „Missing Properties: fb:app_id" und Meta verknüpft Website und App.

**2. Diagnose zeigt die aktive App-ID**
Im Diagnose-Panel unter „Meta App-Grunddaten" wird die aktuell verwendete App-ID sichtbar gemacht, damit du jederzeit prüfen kannst, ob Head, Backend und Meta-Dashboard dieselbe App meinen.

**3. Abgleich-Warnung**
Weicht die ID im Head von der ab, die das Backend nutzt, zeigt das Panel eine klare Warnung statt stiller Abweichung.

## Technische Details

- `index.html`: eine Zeile `fb:app_id` direkt unter `og:type`.
- `supabase/functions/oauth-config-check/index.ts`: liefert die serverseitig genutzte App-ID im Diagnose-Payload zurück (nur die ID, kein Secret).
- `src/components/performance/ConnectionDiagnostics.tsx`: Anzeige der aktiven App-ID plus Mismatch-Hinweis.
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Änderung an der OAuth-Logik.

## Danach

Im Sharing Debugger `https://useadtool.ai/` erneut „Scrape Again" — die `fb:app_id`-Warnung muss weg sein. Anschließend bleibt als letzter echter Blocker für den Facebook-Login: **App Review → `public_profile` → Advanced Access beantragen**.
