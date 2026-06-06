## Befund

Der aktuelle Fehler ist jetzt eindeutig eingegrenzt:

- Die v69-Pipeline selbst läuft an: FaceMap ist korrekt, v69 Single-Face-Preclips werden für Pass 1–3 erzeugt, Sync.so beendet Pass 1–3 erfolgreich.
- Der Abbruch passiert vor Pass 4, noch bevor Sync.so den nächsten Job bekommt.
- Ursache ist unser eigener Audio-Preflight in `compose-dialog-segments`: ein temporärer `fetch`-Timeout beim Lesen einer bereits existierenden WAV-Datei wird als harter Fehler gespeichert:

```text
AUDIO PREFLIGHT BLOCK audio_invalid_Signal timed out.
clip_error = syncso_audio_preflight_audio_invalid_Signal timed out.
```

Das ist kein Beweis für kaputtes Audio. Die gleiche Szene zeigt gültige WAV-Diagnosen für die anderen Speaker; der Timeout ist ein transienter Storage/Netzwerk-Lese-Fehler, wird aber aktuell wie „Audio ist invalid“ behandelt.

## Plan

### 1. Audio-Preflight resilient machen
- `inspectSpeakerAudio()` in `compose-dialog-segments` so ändern, dass Fetch-Timeouts nicht sofort terminal sind.
- 3 Versuche mit kurzem Backoff nutzen.
- Timeout von 30s auf 60s erhöhen.
- Fehler `Signal timed out`, `TimeoutError`, `AbortError`, `network`, `fetch failed` als transient klassifizieren.

### 2. Transiente Preflight-Timeouts nicht als endgültigen Lip-Sync-Fehler speichern
- Wenn nur ein Audio-Fetch zeitweise timeoutet, Szene nicht auf `failed` setzen.
- Stattdessen kontrolliert mit `202`/`retry_later` zurückgeben oder den Pass erneut versuchen lassen.
- Wichtig: keine Credits final refunden und keine v69-Passdaten löschen, solange bereits erfolgreiche Passes existieren.

### 3. v69-Pass-Fortschritt schützen
- Bereits erfolgreiche Passes 1–3 bleiben erhalten.
- Pass 4 wird nach transientem Timeout erneut gestartet, statt die komplette Szene als kaputt zu markieren.
- Die v69-Invariante bleibt erhalten: Sync.so bekommt weiterhin Single-Face-Preclips, nicht die Multi-Face-Plate.

### 4. Aktuell betroffene Szene sauber reaktivieren
- Szene `12ea3e1b-d376-418f-b3e9-96f73e7007e4` aus dem falschen terminalen Fehlerzustand holen.
- Bereits erfolgreiche Passes beibehalten.
- Status zurück auf `running`/`queued` für den nächsten offenen Pass setzen.
- Danach Pass 4 erneut dispatchen lassen.

### 5. Validierung
- Logs prüfen auf:

```text
v69_preclip_unified_ready pass 4
DISPATCH pass=4/4
sync-so-webhook pass 4/4 done
render-sync-segments-audio-mux dispatched
remotion-webhook done
```

- DB-Endzustand prüfen:

```text
lip_sync_status = done/applied
clip_error = null
dialog_shots.status = done
```

## Nicht ändern

- Keine Rückkehr zu Legacy-Pipelines.
- Kein `poll-dialog-shots`, kein `render-dialog-turn`, kein alter v4/v58/v68-Recovery-Pfad.
- Kein Full-Plate-Pfad außer dem bereits vorhandenen automatischen v69-Preclip-Fallback.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>