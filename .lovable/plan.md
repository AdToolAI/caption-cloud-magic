# Keine Seite nach der Facebook-Verbindung

## Was die Screenshots zeigen

Im ersten Meta-Dialog („Welche professionellen Instagram-Konten möchtest du mit AdTool AI Integration verwenden?") ist das Kästchen neben **adtoolai** **nicht angehakt** — du hast direkt auf „Weiter" geklickt. Erst im nächsten Schritt („Welche Seiten…") war die Seite „AdTool AI" angehakt.

Folge: Meta hat die Verbindung zwar erstellt, aber **kein Instagram-Konto freigegeben**. Die Berechtigungsseite zeigt zwar Instagram-Schalter auf „JA", die Freigabe gilt aber für eine leere Auswahl. Deshalb liefert Metas Graph-API beim Seiten-Abruf entweder keine Seite oder eine Seite ohne verknüpftes Instagram-Konto — und der Auswahl-Dialog in der App bleibt leer.

## Was du tun musst (2 Minuten)

1. In AdTool AI unter Verbindungen die Facebook-/Instagram-Verbindung **trennen**.
2. Auf **Verbinden** klicken und den Meta-Dialog erneut durchlaufen.
3. Im ersten Schritt **das Kästchen neben `adtoolai` anhaken** (oder „Alle auswählen").
4. Im zweiten Schritt die Seite **AdTool AI** angehakt lassen.
5. Im dritten Schritt alle vier Schalter auf **JA** lassen → „Fertig".

Danach erscheint die Seite in der App-Auswahl.

## Was ich in der App verbessere

Damit dieser Fehler nicht wieder unbemerkt passiert:

1. **Ehrlicher Leer-Zustand statt leerer Liste.** Wenn Meta keine Seite oder keine IG-verknüpfte Seite liefert, zeigt der Auswahl-Dialog künftig den konkreten Grund im Klartext — inklusive des häufigsten Falls: „Im Meta-Dialog wurde kein Instagram-Konto angehakt."
2. **Direkter „Erneut verbinden mit Neu-Zustimmung"-Button** in diesem Leer-Zustand, der den OAuth-Start mit erzwungenem Re-Consent aufruft, damit die Auswahlseiten wieder erscheinen (Meta überspringt sie sonst).
3. **Hinweis im Meta-Dialog-Vorlauf**: Die bestehende Instagram-Checkliste bekommt einen zusätzlichen Punkt „Im Meta-Dialog beide Häkchen setzen (Instagram-Konto **und** Seite)".

## Technische Details

- `src/components/performance/FacebookPageSelectDialog.tsx`: Leer-Zustand pro `resultStatus` (`no_pages`, `no_instagram_linked`, fehlende Scopes) mit erklärendem Text; `onReconnect`-CTA wird in allen Leer-Fällen angezeigt.
- `src/components/performance/ConnectionsTab.tsx`: `onReconnect` übergibt `force_reconsent`, damit `facebook-oauth-start` `auth_type=rerequest` setzt.
- `supabase/functions/facebook-oauth-start/index.ts` bzw. `instagram-oauth-start`: `auth_type=rerequest` (und für Neu-Auswahl `extras` mit Re-Consent) durchreichen, wenn der Aufruf es anfordert.
- `src/components/performance/InstagramSetupChecklist.tsx`: dritter Checklisten-Punkt.
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Änderung an der Token-Speicherung oder Posting-Logik.
