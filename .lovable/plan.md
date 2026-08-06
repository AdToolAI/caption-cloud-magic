# Meta App-ID verdeckt eintragen

## Ausgangslage (geprüft)

Im Projekt liegt bereits `VITE_META_APP_ID="1769514810345813"` in der `.env`. Diese ID ist eine öffentliche Kennung: Sie steht in jedem Facebook-Login-Aufruf im Browser und wäre auch im `fb:app_id`-Tag für jeden sichtbar. Sie ist kein Geheimnis — geheim ist nur das App-Secret.

Trotzdem sollst du sie nicht im Chat tippen müssen. Deshalb zwei Wege:

## Weg A — verdeckte Eingabe (empfohlen, das was du willst)

1. Ich öffne dir ein sicheres Eingabeformular für `META_APP_ID`. Du trägst die ID dort ein, sie erscheint nirgends im Chatverlauf.
2. Die Diagnose (`oauth-config-check`) liest sie serverseitig und zeigt sie im Panel unter „Meta App-Grunddaten" an — damit siehst du jederzeit, welche ID aktiv ist, ohne sie irgendwo abtippen zu müssen.

## Weg B — `fb:app_id` im Head (nötig für die Meta-Warnung)

Damit die Sharing-Debugger-Warnung „Missing Properties: fb:app_id" verschwindet, muss das Tag **statisch** in `index.html` stehen — Metas Crawler führt kein JavaScript aus, kann also weder Secret noch `import.meta.env` lesen.

Ich trage dafür die bereits im Projekt vorhandene ID `1769514810345813` als `<meta property="fb:app_id" ...>` in den Head ein. Falls das nicht die richtige App ist, sag Bescheid bzw. trag die korrekte über Weg A ein — dann nehme ich diese.

## Technische Details

- Neues Secret `META_APP_ID` über das sichere Formular (kein Klartext im Chat).
- `supabase/functions/oauth-config-check/index.ts`: bevorzugt `META_APP_ID`, fällt auf die bisherige Quelle zurück; gibt die aktive ID im Diagnose-Payload zurück.
- `src/components/performance/ConnectionDiagnostics.tsx`: zeigt die aktive App-ID an, inkl. Hinweis, woher sie stammt (Secret vs. Fallback).
- `index.html`: eine Zeile `<meta property="fb:app_id" content="…" />` direkt bei den Open-Graph-Tags.
- Keine Änderung an der OAuth-Logik.

## Danach

Im Sharing Debugger `https://useadtool.ai/` erneut „Scrape Again" — die `fb:app_id`-Warnung muss dann weg sein.
