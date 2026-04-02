
Do I know what the issue is? Yes.

Was ich konkret gefunden habe

- Der Fehler sitzt aktuell im Backend-Call, nicht im Button.
- Die Logs zeigen einen klaren 404 von Replicate:
```text
POST /v1/models/hjunior29/video-text-remover/predictions → 404 Not Found
```
- Die aktuelle Function ruft das Modell so auf:
```ts
replicate.run("hjunior29/video-text-remover", ...)
```
- Laut API-Doku muss dieses Modell aber versioniert aufgerufen werden, z. B.:
```ts
"hjunior29/video-text-remover:247c8385f3c6c322110a6787bd2d257acc3a3d60b9ed7da1726a628f72a42c4d"
```

Zusätzlich sind noch 3 Folgeprobleme im Code sichtbar:

1. Die Function läuft synchron, obwohl das Modell oft ~100s braucht.
2. Das Ergebnis wird aktuell wie eine String-URL behandelt, die API liefert hier aber nicht zuverlässig genau dieses Format.
3. Das Frontend zeigt nur einen generischen Fehler-Toast und verschluckt die echte Ursache.

Plan

1. Edge Function korrekt auf Replicate umstellen
- `supabase/functions/director-cut-remove-burned-subtitles/index.ts` überarbeiten
- korrekte versionierte Model-ID verwenden
- Output robust normalisieren
- strukturierte Fehler zurückgeben:
```ts
{ ok: false, code, step, error }
```

2. Die Verarbeitung asynchron machen
- nicht mehr in derselben Request warten, bis das ganze Video fertig ist
- stattdessen:
```text
Start Prediction → sofort "processing" zurückgeben → Webhook übernimmt Abschluss
```
- dafür eine eigene Webhook-Function anlegen, die das fertige Video in Storage speichert und den Projektstatus aktualisiert

3. Status sauber im Director’s-Cut-Projekt speichern
- `director_cut_projects` um Felder erweitern wie:
  - `cleaned_video_url`
  - `use_cleaned_video`
  - `burned_subtitles_status`
  - `burned_subtitles_error`
  - `burned_subtitles_prediction_id`
- so bleibt das Ergebnis auch nach Reload erhalten
- die vorhandenen Projekt-RLS-Regeln passen dafür bereits

4. Step 10 an echten Projektstatus anbinden
- `DirectorsCut.tsx` soll `projectId` sowie Cleaned-Video-Status mitführen
- `projectId` und Cleaned-Video-State auch im Draft speichern
- `CapCutEditor.tsx` bekommt `projectId` und pollt den Projektstatus, bis `completed` oder `failed` zurückkommt

5. Fehler- und Status-UX in Step 10 verbessern
- `CapCutEditor.tsx` soll `FunctionsHttpError.context.json()` auslesen
- statt nur „Entfernung fehlgeschlagen“ die echte Ursache anzeigen
- `CapCutSidebar.tsx` soll klare Stati zeigen:
  - Wird vorbereitet
  - Wird entfernt
  - Fertig
  - Fehlgeschlagen
- „Original wiederherstellen“ soll nur umschalten, nicht das bereinigte Ergebnis vergessen

Warum ich es so lösen würde

- Nur die Modell-ID zu korrigieren wäre wahrscheinlich der nächste halbe Fix.
- Damit würden wir den 404 beheben, aber das Feature bliebe bei längeren Videos weiterhin fragil.
- Mit async + Projektstatus + Webhook lösen wir:
  - den aktuellen 404,
  - mögliche Timeouts,
  - schlechte Fehlermeldungen,
  - verlorene Ergebnisse nach Reload.

Betroffene Dateien

- `supabase/functions/director-cut-remove-burned-subtitles/index.ts`
- `supabase/functions/director-cut-burned-subtitles-webhook/index.ts` (neu)
- `supabase/config.toml`
- neue Migration für `director_cut_projects`
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/lib/directors-cut-draft.ts`
- `src/components/directors-cut/studio/CapCutEditor.tsx`
- `src/components/directors-cut/studio/CapCutSidebar.tsx`
