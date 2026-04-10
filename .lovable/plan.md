
Ziel: Der Facebook-"View post"-Link soll immer direkt zum echten Facebook-Post führen statt auf eure eigene Seite oder eine unbrauchbare Fallback-URL.

Was ich im Code gefunden habe:
- Die UI ist korrekt: `PublishResultCard` zeigt einfach `result.permalink` als normalen Link an.
- Das Problem sitzt im Backend `supabase/functions/publish/index.ts`.
- Dort gibt es zwar schon einen Versuch, `permalink_url` von Facebook zu holen, aber:
  1. Für Video-Posts wird als Fallback aktuell `https://www.facebook.com/{pageId}/videos/{videoId}` gebaut. Das ist eher eine Page/Video-Ansicht und nicht zuverlässig der konkrete veröffentlichte Post.
  2. Für Bild-/Feed-Posts wird bei Fehlern ein generischer Fallback gebaut, der ebenfalls nicht immer auf den echten Beitrag zeigt.
  3. Der Orchestrator hat eine 24h-Deduplizierung über `content_hash`. Wenn derselbe Inhalt nochmal gepostet wird, kommen alte `publish_results` zurück. Falls dort ein falscher oder leerer Permalink gespeichert wurde, sieht man weiter denselben kaputten Link.

Umsetzungsplan:
1. `publishToFacebook` robuster machen
- Für Feed-/Bild-Posts nach dem Publish nicht nur `/{post_id}?fields=permalink_url`, sondern zusätzlich die Facebook-Response sauber auswerten:
  - bei Foto-Posts `post_id` bevorzugen, falls Facebook statt echter Post-ID nur eine Objekt-ID liefert
  - erst danach `permalink_url` abfragen
- Für Video-Posts den konkreten Post-Link über die echte veröffentlichte Objekt-ID auflösen statt nur die `/videos/{videoId}`-Fallback-URL zu verwenden.

2. Schlechte Facebook-Fallbacks entfernen bzw. absichern
- Keine Fallback-URL mehr zurückgeben, die nur auf die Seite oder eine allgemeine Videoansicht führt.
- Lieber `permalink` nur dann setzen, wenn der Link nachweislich ein echter Facebook-Post-Link ist.
- Optional: einfache Validierung einbauen, damit niemals eure eigene Domain als `permalink` gespeichert wird.

3. Deduplizierungsproblem beheben
- Wenn ein Duplicate Publish erkannt wird und vorhandene Facebook-Ergebnisse keinen brauchbaren Permalink haben, den Permalink serverseitig nachträglich reparieren:
  - anhand von `external_id`
  - neuen Link ermitteln
  - `publish_results`/Response mit dem reparierten Permalink zurückgeben
- So funktionieren auch bereits gepostete Inhalte wieder, ohne dass der User den Content künstlich ändern muss.

4. Logging für Facebook-Link-Debugging ergänzen
- Loggen, welche ID Facebook zurückliefert (`id`, `post_id`, `video_id`)
- Loggen, welche URL als finaler Permalink gespeichert wird
- Loggen, wenn nur ein schwacher Fallback möglich war

5. Testen
- Bildpost auf Facebook veröffentlichen → "View post" muss direkt auf Facebook öffnen
- Videopost auf Facebook veröffentlichen → "View post" muss direkt auf Facebook öffnen
- Direkt denselben Content nochmal posten → deduplizierte Antwort muss trotzdem den korrigierten Link liefern
- Prüfen, dass nie wieder eure Domain als Facebook-Permalink zurückkommt

Betroffene Datei:
- `supabase/functions/publish/index.ts`

Technische Details:
```text
UI
  PublishResultCard
    -> nutzt result.permalink direkt

Backend
  publishToFacebook()
    -> Facebook publish response auswerten
    -> echte Post-ID bestimmen
    -> permalink_url abfragen
    -> nur valide Facebook-URL zurückgeben

Orchestrator
  duplicate content_hash hit
    -> alte publish_results prüfen
    -> fehlenden/falschen Facebook-Permalink reparieren
```
