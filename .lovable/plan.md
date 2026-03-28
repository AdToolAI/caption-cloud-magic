

## Fix: Passwort für rodger@dusatko.com zurücksetzen

### Problem
Der Account `rodger@dusatko.com` existierte bereits seit Oktober 2025 mit einem anderen Passwort. Die Edge Function hat den User nicht neu erstellt, sondern nur Profil/Wallet-Daten aktualisiert. Das Passwort blieb unverändert.

### Lösung
Eine einmalige Edge Function erstellen, die `supabase.auth.admin.updateUserById()` aufruft, um das Passwort auf `Wonderful01$` zu setzen.

```typescript
await supabase.auth.admin.updateUserById(userId, {
  password: 'Wonderful01$'
});
```

### Ablauf
1. Temporäre Edge Function `reset-rodger-password` erstellen
2. Einmal aufrufen
3. Function wieder löschen

### Dateien
- **Neu (temporär):** `supabase/functions/reset-rodger-password/index.ts`

