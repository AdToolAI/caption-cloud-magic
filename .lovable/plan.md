# V506 — Identitäts-Gate für Anker (falsche Personen / falsches Geschlecht)

## Was ich nachgewiesen habe

- Cast von S02 ist korrekt konfiguriert: Sarah (w), Samuel (m), Matthew (m), Kay (m) — alle mit `portrait_url`, `reference_image_url`, `identity_lock_strength: strict`.
- Der Anker von **S01** (`be60d106`) zeigt exakt diesen Cast: 1 Frau, 3 Männer, Dachterrasse. Identitätsinjektion funktioniert also grundsätzlich.
- Der Anker von **S02** (`67b392b1`) zeigt 2 fremde Frauen und 2 fremde Männer in einer Büroküche — keine der vier Portrait-Identitäten, falsches Geschlechterverhältnis.
- Im Code ist der Gemini-Identity-Audit seit v267 **kein Hard-Gate mehr**: bei `swap`, `missing`, `clone`, `ambiguous` wird nur `twoshot_stage: anchor_soft_pass` plus Warntext geschrieben und der Anker trotzdem an den Provider gegeben (`compose-video-clips/index.ts` ~3870–3925). Ein komplett falsch besetzter Anker kann die Pipeline also nie stoppen.
- Der Nutzer sieht dadurch nicht den echten Grund, sondern erst den Folgefehler `fa4_fail_closed:count_mismatch` am Ende der Kette.
- Nicht verifizierbar: was der Audit für S02 konkret gemeldet hat. `preview_audit` ist leer und die Edge-Logs für diese Szene sind nicht mehr abrufbar. Telemetrie fehlt — das ist Teil des Fixes.

## Was gebaut wird

### A. Zweistufiger Identity-Verdict statt "alles soft"
Der Audit wird in zwei Klassen getrennt:

- **grob falsch** (kein einziges Cast-Gesicht erkannt, oder Geschlechterverhältnis weicht vom Cast ab, oder `swap` über mehrere Slots): Anker wird verworfen, **eine** erneute Komposition mit Face-Lock + explizitem Geschlechter-/Namens-Constraint. Bleibt es grob falsch → harter Abbruch **vor** jedem Provider-Dispatch (null Kosten) mit klarer Meldung: "Der Anker zeigt nicht deinen Cast".
- **unsicher** (`ambiguous`, ähnliche Gesichter, einzelner unklarer Slot): bleibt Soft-Pass wie heute, damit falsch-positive Audits keine Szene blockieren.

### B. Geschlechts-Constraint in der Anker-Komposition
Aus den Brand-Characters wird die Geschlechterverteilung des Casts abgeleitet und als verbindliche Klausel in den Anker-Prompt gehängt (z. B. "exactly 1 woman and 3 men, one per reference portrait, no substitutions"). Zusätzlich als Prüfkriterium im Audit.

### C. Ort-Konsistenz prüfen
Vor dem Fix wird geprüft, ob S02 im Prompt überhaupt die Szenen-Location mitbekommt oder ob der Ort aus der Szenenbeschreibung verloren geht. Falls die Location nicht durchgereicht wird, wird sie als Pflichtklausel ergänzt — ansonsten unverändert lassen.

### D. Telemetrie persistieren
Audit-Ergebnis (Verdict, gefundene/fehlende Namen, Face-Count, Anker-URL, Attempt-Nummer) wird nach `composer_scenes.preview_audit` geschrieben, damit künftige Triage nicht von Edge-Logs abhängt.

## Technische Details

- `supabase/functions/compose-video-clips/index.ts`: Verdict-Klassifizierung (`grossIdentityFailure` vs. `uncertain`), Hard-Block-Zweig vor dem Provider-Dispatch, `preview_audit`-Write.
- `supabase/functions/_shared/`: neues Modul `v506-identity-verdict.ts` mit reiner Klassifizierungsfunktion + Geschlechter-Constraint-Builder (unit-testbar).
- Anker-Prompt-Erweiterung im bestehenden Kompositionsaufruf (kein neuer Provider, keine Kostenänderung).
- Test: `src/test/composer/v506-identity-verdict.test.ts` — grobe vs. unsichere Verdicts, Geschlechter-Constraint, kein Block bei `extra`.
- Kein Rerender-Automatismus, keine Änderung an der Lip-Sync-Kette.
