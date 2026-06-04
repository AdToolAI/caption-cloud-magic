## Befund

Der Lip-Sync ist nicht erst während des Renderings fehlgeschlagen, sondern Sync.so hat den Job sofort beim Dispatch abgelehnt:

```text
422: Segment at index 0 references unknown refId 'speaker_1'
```

Die v43-Pipeline baut aktuell die Audio-Inputs mit `ref_id`, die Segmente referenzieren aber `audioInput.refId`. Laut aktueller Sync.so-Doku müssen diese Referenzen exakt übereinstimmen; in der API-Beschreibung steht für Segments ausdrücklich `refId`.

## Ziel

v43 soll wieder exakt im Sync.so-Segments-Schema dispatchen:

```text
input: [
  { type: "video", url },
  { type: "audio", url, refId: "speaker_1" },
  { type: "audio", url, refId: "speaker_2" },
  { type: "audio", url, refId: "speaker_3" }
]
segments: [
  {
    startTime,
    endTime,
    audioInput: { refId: "speaker_1", startTime, endTime },
    optionsOverride: {
      active_speaker_detection: {
        frame_number,
        bounding_boxes: [[x1, y1, x2, y2]]
      }
    }
  }
]
```

## Umsetzung

1. In `supabase/functions/compose-dialog-segments/index.ts` den v43-Input-Typ und Payload ändern:
   - Audio-Inputs von `ref_id` auf `refId` umstellen.
   - Logs weiterhin `audio_refs` ausgeben, damit wir im nächsten Run direkt sehen, dass die Referenzen identisch sind.
   - Optional in `meta.payload_summary` auch die tatsächlichen Input-Refs mitschreiben.

2. Fehlerstatus der betroffenen Szene `4992cff4-e351-461c-aaae-a765696acf12` gezielt zurücksetzen:
   - `lip_sync_status` zurück auf `pending` oder den bestehenden UI-Reset-Pfad auslösen.
   - `dialog_shots` nur so weit bereinigen, dass der nächste Dispatch v43 frisch mit `refId` sendet.
   - Keine allgemeine Datenmüll-Bereinigung; nur diese fehlgeschlagene Szene reparieren.

3. Deployment/Validierung:
   - `compose-dialog-segments` neu deployen.
   - Danach die Funktion für die Szene erneut anstoßen.
   - Erwarteter Log-Marker:

```text
v43_official_segments_payload model=lipsync-2-pro asd=bbox ... audio_refs=["speaker_1","speaker_2","speaker_3"]
```

   - Erwartet: kein 422 `unknown refId` mehr. Danach läuft der Sync.so-Job normal weiter bis Webhook/Polling.

## Nicht-Ziele

- Keine Änderung an `bounding_boxes`/ASD-v43-Logik.
- Kein Wechsel zurück zu Fan-out.
- Kein Cleanup alter v5-v42-Daten oder Memories, bis ein echter v43-Run grün durchgelaufen ist.