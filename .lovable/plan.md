# Sync.so Root-Cause-Isolation — Binary Search in max. 2 Replays

## Die Fehlerklassen sind endlich

`generation_unknown_error` ist Sync.so's Catch-all. Laut deren Doku + Community gibt es genau **6 Ursachen**:

| # | Klasse | Sync.so-Symptom | Lokal vor Dispatch prüfbar? |
|---|---|---|---|
| 1 | Video-URL nicht von Sync.so fetchbar | 401/403/Timeout auf deren Side | ✅ ja |
| 2 | Video-Codec/Container nicht akzeptiert (nur H.264/MP4 zuverlässig) | Decode-Fail | ✅ ja (ftyp + codec_string) |
| 3 | Audio-URL nicht fetchbar oder falscher Content-Type | Decode-Fail | ✅ ja |
| 4 | Audio enthält keine erkennbare Sprache / zu leise / zu kurz | STT-Fail | ✅ ja (RMS + Duration) |
| 5 | Im Video kein Gesicht am angegebenen Frame/Koord | ASD-Fail | ✅ ja (Gemini-Face-Probe v129.6 existiert schon) |
| 6 | Video-/Audio-Duration-Mismatch > Toleranz | Sync-Fail | ✅ ja |

**Alle 6 sind vor dem Dispatch deterministisch erkennbar.** Wir brauchen keine 3 Trial-and-Error-Replays — wir brauchen einen **Preflight, der vor jedem Replay läuft und uns sagt, welche der 6 Klassen failed**. Falls Preflight grün ist und Sync.so trotzdem `generation_unknown_error` returnt → echter Provider-Bug, dann Sync.so-Support mit Bundle.

## Lösung in zwei Bausteinen

### Baustein A — `syncso-preflight` Edge-Function (neu, read-only)

Eine reine Diagnose-Function, kein Sync.so-Call, kein Credit-Spend. Input: `{ pass_id, scene_id }`. Output: 6 Check-Resultate mit `pass/fail/warn` + Detail.

```text
GET https://.../syncso-preflight?pass_id=…
{
  "video_fetchable":   { status:"pass", http:200, content_type:"video/mp4", bytes:4823100 },
  "video_codec":       { status:"pass", brand:"isom", codec:"avc1.640028", w:1080, h:1920, fps:30 },
  "audio_fetchable":   { status:"pass", http:200, content_type:"audio/mpeg", bytes:142336 },
  "audio_speech":      { status:"warn", duration_s:8.9, rms_db:-32.1, note:"leise aber ok" },
  "face_at_frame":     { status:"fail", frame:50, coord:[360,363], gemini_face_bbox:null, note:"kein Gesicht erkannt" },
  "duration_match":    { status:"pass", video_s:9.0, audio_s:8.9, delta_s:0.1 },
  "verdict":           "fail",
  "first_blocker":     "face_at_frame"
}
```

Implementierung pro Check:
1. **video_fetchable / audio_fetchable**: Range-GET (Bytes 0-65535) + Content-Type-Header
2. **video_codec**: aus den 64 KB die `ftyp`-Box + `moov.trak.mdia.minf.stbl.stsd.avcC` parsen (kein ffmpeg nötig, ~80 Zeilen pure TS — Brand muss in `[isom, mp42, iso5]`, codec muss `avc1.*` sein)
3. **audio_speech**: erste 256 KB laden, bei MP3/WAV grobes RMS aus Sample-Frames (oder als Shortcut: einfach Duration aus Header + warn wenn < 0.4s)
4. **face_at_frame**: existiert bereits in v129.6 als optionale Gemini-Probe — hier **immer** ausführen
5. **duration_match**: Video aus `moov.mvhd`, Audio aus Container-Header

### Baustein B — Forensik-Sheet zeigt Preflight oben, Replay erst danach

Im `SyncsoForensicsSheet.tsx`:
- Beim Öffnen automatisch `syncso-preflight` aufrufen
- Resultat als Ampel-Tabelle oben anzeigen (6 Zeilen, grün/gelb/rot, je mit Detail-Tooltip)
- Wenn `verdict=fail` → großer Banner: "Blocker erkannt: <first_blocker>". Replay-Button bleibt nutzbar, aber sekundär.
- Wenn `verdict=pass` und Sync.so trotzdem `generation_unknown_error` returnt → Banner: "Preflight grün — wahrscheinlich Sync.so-Bug. Bundle exportieren und Sync.so-Support."

## Was das löst

- **Keine Trial-and-Error-Replays mehr.** Eine Sheet-Öffnung sagt dir in <2s welche der 6 Klassen failed.
- **Wir kennen die Antwort, bevor wir Credits ausgeben.**
- Falls Sync.so trotz grünem Preflight failed: wir haben ein wasserdichtes Bundle für deren Support — das ist genau die Diagnostik, die andere Teams ebenfalls fahren.
- Für die aktuelle Scene `85e38890…` Pass 0 (Frame 50, Koord 360/363, Hailuo-9s-Vertical): mein starker Verdacht ist Klasse 5 (kein Face am Frame) oder Klasse 2 (Hailuo-Output-Codec). Preflight wird's binnen Sekunden zeigen.

## Reihenfolge

1. `supabase/functions/syncso-preflight/index.ts` neu (read-only, kein Wallet)
2. `SyncsoForensicsSheet.tsx`: Preflight-Panel oben einbauen, `useQuery` mit `staleTime: 0`
3. Manual: Sheet für betroffene Scene öffnen → Diagnose ablesen → echte Ursache benennen

## Explizit NICHT im Scope

- Keine Production-Dispatch-Änderung
- Keine neuen Replay-Presets (die aus v129.5/7 reichen)
- Kein Sync.so-API-Version-Wechsel
- Keine ffmpeg-Integration (Container-Parsing in TS reicht für H.264/MP4)
- Keine Gemini-Calls außer dem bereits existierenden Face-Probe
- Keine Wallet-/Refund-/Watchdog-Logik
