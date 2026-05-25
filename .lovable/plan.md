## Problem

Neue Nutzer bekommen bei der Registrierung eine E-Mail mit Absender/Titel **„caption-cloud-magic"** statt **AdTool AI**. Grund: Im Projekt gibt es noch **keine eigenen Auth-E-Mail-Templates** — Supabase versendet die Default-Bestätigungs-Mails, in denen der interne Projektname auftaucht.

## Lösung

Eigene, AdTool-AI-gebrandete Auth-E-Mail-Templates aufsetzen, die alle Auth-Mails (Signup-Bestätigung, Passwort-Reset, Magic-Link, Invite, E-Mail-Wechsel, Reauth) im Look & Feel der App versenden.

## Schritte

1. **Auth-E-Mail-Templates scaffolden** (6 Templates + `auth-email-hook` Edge Function)
2. **Branding anwenden** auf Basis von `src/index.css` (Primary, Background, Foreground, Radius) und `Brand`-Komponente (Sparkles-Icon + „AdTool AI" Wortmarke):
   - Body-Background: weiß (`#ffffff`) — Pflicht
   - Buttons: Primary-Farbe aus Design-System
   - Headings/Text in Foreground/Muted-Foreground
   - Font-Stack passend zur App
   - Mehrsprachig: DE als Default (App-Default), zusätzlich EN + ES (gemäß Core-Memory zur Lokalisierung)
   - Absender-/Anrede-Name: **AdTool AI**
   - Footer: „AdTool AI Team", Link zu `useadtool.ai`
3. **Deploy** der `auth-email-hook` Edge Function
4. **Aktivierung** läuft automatisch über die bereits konfigurierte Sender-Domain

## Out of Scope

- Keine Änderungen am Auth-Flow selbst (Signup/Login)
- Keine neuen transactional Emails (nur Auth)
- Keine DNS-/Domain-Änderungen — bestehende Sender-Domain wird verwendet

## Ergebnis

Neue Anmeldungen erhalten eine Bestätigungs-E-Mail mit Betreff/Inhalt im AdTool-AI-Branding statt „caption-cloud-magic".
