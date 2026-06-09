## Befund aus der DB

Szene `63fc42c2…` mit 4 Sprechern. Alle 4 Pässe stehen auf `status=done`, jeder hat `output_url`, jeder hat eine sinnvolle `audio_tight` (Sarah: 1.818s, window [6.707, 8.525]) und eine plausible `preclip_crop` (Sarah: x=32, y=346, size=160). Strukturell ist Sarahs Pass identisch zu Pässen 1–3 (gleiche `retry_variant: coords-pro`, gleiches Preclip-Schema, gleiche v90-Offsets). Sync.so-Webhook hat alle 4 Pässe als „done" geliefert, danach lief der Audio-Mux.

Das heißt: der Pipeline‑*Status* ist sauber — aber das visuelle Ergebnis (Sarahs Lippen bewegen sich nicht) entspricht nicht den Statusdaten. Bevor wir Code anfassen, müssen wir wissen WO die Lipsync verloren geht: bei Sync.so (Output ist Passthrough ohne animierte Lippen) oder im Mux (Lipsync ist da, wird aber falsch overlayed).

## Diagnose (read-only, sehr schnell)

D1. **Sarahs Preclip vs. Sync.so-Output Pixel-für-Pixel vergleichen.**
    Wenn beide identisch sind → Sync.so hat den Lipsync für Pass 4 verworfen (silent passthrough). Wenn nicht → Lipsync existiert, also liegt's am Mux.
    - Preclip: `…/dialog-pass-preclip-63fc42c2-…-p3-….mp4`
    - Output: `…/63fc42c2-…-lipsync-pass-4.mp4`

D2. **Sarahs Tight-WAV abhören**: `…-pass-4-tight-….wav` muss klar Sarahs Stimme enthalten, ~1.8s. Wenn (fast) stumm → Slice-Window-Bug, Sync.so hatte nichts zum Animieren. (Beachte: ihre Window-Position [6.707, 8.525] liegt nahe am Plate-Ende `totalSec`. Wenn `totalSec` z. B. nur 8.4s ist, wird `e=min(totalSec, …)` → Window collabiert ≈ 1.7s, aber wenn `audio_url_full` Stille hat, ist die Slice leise.)

D3. **Sync.so /generate Job 28ced758 direkt abfragen** (`GET /v2/generate/{id}`). Wenn Sync.so `lip_sync_status=success` mit Quality-Score liefert → wirklich animiert. Wenn `partial` / Warning → Sync.so hat heimlich aufgegeben (z. B. weil Audio zu kurz oder weil Preclip nahe am Bild­rand keine erkennbare Face-Region bot).

D4. **Quick-Check: Mux-Lambda-Render visuell prüfen** (`final_url` der Szene). Frame bei t≈7.5s extrahieren und mit Sarahs Preclip-Output bei t≈0.8s vergleichen — sind die Pixel im Crop-Bereich identisch?

→ Eines dieser 4 Resultate sagt eindeutig welche Stage schuld ist.

## Hypothesen + gezielte Fixes (erst nach Diagnose committen)

H1. **Sync.so verwirft Pass 4 still, weil Sarahs Preclip-Face zu nah am linken Bildrand sitzt** (cropX=32 in 720er Plate → die 160px Crop-Region berührt fast Pixel 0). Beim 512×512 Preclip ist Sarahs Gesicht zwar zentriert, aber Sync.so kann bei extremen Edge-Cases (Master-Face am Rand) den Identity-Check verlieren → Passthrough.
   → **Fix H1**: Min-Margin bei `preclipCrop` (z. B. 24px Sicherheits­abstand zu jedem Plate-Rand), und wenn der berechnete Crop kollabiert, Crop-`size` auf 192 erhöhen (mehr Kontext). Datei: `compose-dialog-segments/index.ts` (Preclip-Crop-Block).

H2. **Sarahs Tight-WAV ist tatsächlich leise** — die per-Speaker-WAV `…-char3-sarah-dusatko.wav` ist silence-padded und Sarahs Voice-Onset liegt evtl. nicht bei master-t 6.787, sondern etwas später. Die Slice [6.707, 8.525] erwischt dann nur Stille + Restwort.
   → **Fix H2**: vor dem Slice einen RMS-Probe-Pass: wenn Window-RMS < threshold → Window per phase-Onset-Detection auf das tatsächliche Sprach-Onset re-zentrieren (oder zumindest `endTime` um +0.2s strecken).

H3. **Sync.so liefert für Pass 4 ein Output, das kürzer als das Tight-Audio ist** (Sync.so `cut_off` Verhalten am Audio-Ende), und der Mux mappt mit `sourceStartSec=0` korrekt, aber Sarahs Lippen-Frames liegen jenseits des Output-Endes.
   → **Fix H3**: im Mux `endSec = min(startSec + outputDurationProbed, originalEndSec)` clampen; und/oder beim Dispatch `sync_mode='loop'` statt `cut_off` für den LAST pass.

H4. **Webhook-Race**: der „all-done"-Webhook feuert Mux 1s nachdem Sarahs `output_url` persistiert wurde — möglicherweise rendert der Mux mit einem leeren / 404-Output für Pass 4, weil das S3-Object noch nicht öffentlich ist.
   → **Fix H4**: HEAD-Check auf alle 4 `output_url` bevor `render-sync-segments-audio-mux` startet; 2-3 Retries mit kurzem Backoff.

## Bitte um Auswahl

Damit wir nicht spekulativ Code anfassen:

1. **Sollen wir mit D1+D4 starten** (Pixel-Vergleich der zwei MP4s) — das engt die Stage in 1 Minute ein?
2. Oder sollen wir **direkt H1 + H4 vorbeugend implementieren** (beides risikoarm, beides plausibel für „immer der letzte Speaker"), und parallel die Diagnose laufen lassen?

Sobald die Stage klar ist, kommt ein zweiter Commit mit dem konkreten Fix (H1, H2, H3 oder H4) und einem manuellen Reset auf Pass 4 für die aktuelle Szene, ohne die schon gerenderten Pässe 1–3 zu zerstören.
