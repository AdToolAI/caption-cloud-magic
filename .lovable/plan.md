## Wo wir stehen

UDC ist eingefroren, Analytics-Events + UDC-Vergleichstabelle sind gebaut. Vor dem Publish blockiert aktuell **ein kritischer Security-Fund**, der zwingend zuerst gefixt werden muss.

## Empfohlene Reihenfolge

### 1. 🚨 Security-Hotfix (blockt Publish)
- **`user_roles` Privilege-Escalation** (error-Level): Drei RLS-Policies (Admin INSERT/UPDATE/DELETE) benutzen den globalen `has_role(uid, role)`-Overload → jeder Workspace-Admin kann sich Plattform-weit zum Admin machen.
- Fix: Policies auf `has_role(auth.uid(), workspace_id, 'admin')` umstellen (workspace-scoped Overload, wie schon bei der Create-Policy).
- Zusätzlich (warn, empfohlen im gleichen Zug): `bug-screenshots` Bucket-SELECT auf `(storage.foldername(name))[1] = auth.uid()::text` einschränken.

### 2. Publish
Nach dem Fix `preview_ui--publish` → Analytics + Vergleichstabelle + Preflight gehen live.

### 3. Conversion-Sprint (nach Publish)
- **PostHog-Dashboard verdrahten**: Funnel „udc_showcase_cta_clicked → udc_pricing_cta_clicked → checkout_started → subscription_activated", plus Moat-Feature-Adoption (Preflight/Anchor/AutoCut).
- **Landing-Proof**: Ein einziges 15s-UDC-Demo-Video (Voice-Lock → Anchor-Refresh → Preflight-OK → Export) in `UDCShowcase` einbetten statt der statischen Feature-Karten. Asset erstellst du im Motion Studio, ich verdrahte den Player.
- **SEO-Feinschliff**: `<title>`/`meta description`/OG-Tags für `/pricing` und `/directors-cut` auf „Consistency-First AI Video Editor" ausrichten + JSON-LD `SoftwareApplication` mit den 5 Moat-Features.
- **Trial-CTA im Preflight-Dialog**: Wenn Free-User Preflight öffnet und ≥1 error hat → sanfter Upgrade-Hint („Auto-Fix ist Pro"). Nutzt bestehendes Smart-Upgrade-Modal.

### 4. Optionaler nächster Moat-Baustein (nach Conversion-Signalen)
Erst wenn Analytics zeigt, *welche* Moat-Features Nutzer tatsächlich klicken, entscheiden wir, welches Feature den Freeze verlässt (z.B. Voice-Lock als eigene Route, oder Preflight-Auto-Fix).

## Technische Details (Punkt 1)

```sql
-- user_roles: Admin-Policies auf workspace-scoped Overload umstellen
DROP POLICY "Admins can insert roles" ON public.user_roles;
DROP POLICY "Admins can update roles" ON public.user_roles;
DROP POLICY "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), workspace_id, 'admin'::app_role));

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), workspace_id, 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), workspace_id, 'admin'::app_role));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), workspace_id, 'admin'::app_role));

-- bug-screenshots: Owner-Ordner erzwingen
DROP POLICY IF EXISTS "<current select policy>" ON storage.objects;
CREATE POLICY "bug_screenshots_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bug-screenshots'
         AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "bug_screenshots_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bug-screenshots'
         AND public.has_role(auth.uid(), 'admin'::app_role));
```

Supply-Chain-Warnings (`@huggingface/transformers`, `posthog-js`, `vitest`) sind `warn`-Level, blocken Publish nicht — separater Housekeeping-Sprint.

## Was ich nach Approve mache
1. Migration schreiben & anwenden (Punkt 1).
2. Security-Rescan zur Bestätigung.
3. `preview_ui--publish` (Punkt 2).
4. Danach im nächsten Turn Conversion-Sprint (Punkt 3) starten — mit dir abgestimmt, welches der drei Items zuerst.
