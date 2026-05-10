Do I know what the issue is? Ja.

Das aktuelle Problem ist nicht mehr der Start des Renders: Die betroffene Szene hat bereits eine `clip_url` und eine `replicate_prediction_id`, bleibt aber in der Datenbank auf `clip_status='generating'` und `lip_sync_status='pending'`. Dadurch wartet das UI endlos, weil der nächste Schritt nur bei einem Statuswechsel auf `ready` startet. Zusätzlich ist `compose-clip-webhook` nicht explizit als öffentlicher Provider-Webhook konfiguriert; Replicate-Webhooks können keine Nutzer-Session mitschicken, daher muss dieser Callback ohne JWT erreichbar sein.

Plan:

1. Webhook-Konfiguration absichern
   - In `supabase/config.toml` einen Funktionsblock für `compose-clip-webhook` ergänzen.
   - `verify_jwt = false` setzen, damit externe Render-Provider den Abschluss-Webhook zuverlässig zustellen können.
   - Optional kurze Timeouts nicht erhöhen, da der Webhook nur Status/Storage finalisiert.

2. Stuck-Scene-Self-Heal im Frontend einbauen
   - In `ClipsTab.tsx` `pollScenes` erweitern:
     - Wenn `clip_status='generating'`, aber `clip_url` bereits vorhanden ist, behandelt das UI die Szene als fertig gerendert.
     - Für `engine_override='cinematic-sync'` wird dann automatisch der Lip-Sync-Schritt angestoßen.
   - Damit bleibt eine Szene nicht mehr unbegrenzt auf „Wird generiert…“, falls der Webhook zwar teilweise/anderweitig Daten geschrieben hat, aber den Status nicht finalisiert hat.

3. Webhook robuster machen
   - In `compose-clip-webhook` beim erfolgreichen Rendern `lip_sync_status` für Cinematic-Sync nicht blockierend lassen, sondern sauber für den nächsten Schritt vorbereiten.
   - `clip_error` beim erfolgreichen Clip leeren, damit alte HeyGen-Fehler wie „Talking Photo deleted“ nicht neben einem neuen Hailuo-Render stehen bleiben.

4. Lip-Sync-Trigger zuverlässig machen
   - `compose-lipsync-scene` darf bei fehlender Voiceover-Datei nicht endlos „pending“ lassen.
   - Wenn kein Voiceover vorhanden ist, wird die Szene als nutzbarer Hailuo-Clip fertig angezeigt statt ewig zu warten.
   - Falls ein echter Sync.so-Fehler passiert, wird `lip_sync_status='failed'` gesetzt und die UI zeigt einen klaren Fehler statt endloser Generierung.

5. Einmalige Reparatur für aktuell hängende Szene
   - Die aktuelle hängende Szene mit vorhandener `clip_url` wird aus `generating/pending` herausgeholt.
   - Wenn Voiceover vorhanden ist: Lip-Sync wird neu angestoßen.
   - Wenn kein Voiceover vorhanden ist: Szene wird auf `ready` gesetzt, damit du weiterarbeiten kannst.

Erwartetes Ergebnis:
- Nach einem Hailuo-Render bleibt die Szene nicht mehr 10+ Minuten im Spinner hängen.
- Cinematic-Sync geht automatisch in den Lip-Sync-Schritt oder zeigt einen echten Fehler.
- Bereits hängende Szenen werden beim nächsten Poll/Reload automatisch repariert.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>