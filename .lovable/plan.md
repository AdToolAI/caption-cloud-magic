

## Problem

TikTok gibt den Fehler `unaudited_client_can_only_post_to_private_accounts` zurück. Da dein TikTok-App-Antrag abgelehnt wurde, befindet sich die App im **Sandbox-Modus**. In diesem Modus erlaubt TikTok nur `privacy_level: 'SELF_ONLY'` (als Draft posten), nicht `PUBLIC_TO_EVERYONE`.

## Lösung

**Datei: `supabase/functions/publish/index.ts`** (Zeile 897)

`privacy_level` von `'PUBLIC_TO_EVERYONE'` auf `'SELF_ONLY'` ändern. Das Video wird dann als Draft im TikTok-Konto des verbundenen Users erstellt — genau wie es für Sandbox-Apps vorgesehen ist.

Optional: Einen Kommentar hinzufügen, dass dies nach erfolgreicher App-Review auf `PUBLIC_TO_EVERYONE` geändert werden kann.

## Ergebnis

Der 403-Fehler verschwindet. Videos werden als Drafts in der TikTok-App hochgeladen, wo sie manuell veröffentlicht werden können.

