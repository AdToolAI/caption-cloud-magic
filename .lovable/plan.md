

## Plan: Upload-Input nach Upload zurücksetzen

### Problem
Nach dem Hochladen eines Fotos in der Mediathek kann kein weiteres hochgeladen werden, weil der `<input type="file">` seinen Wert behält. Der Browser ignoriert einen erneuten Klick, wenn dieselbe Datei gewählt wird, und das `onChange`-Event feuert nicht mehr.

### Änderung

**Datei: `src/pages/MediaLibrary.tsx`**

In der `handleUpload`-Funktion (Zeile ~440) am Ende im `finally`-Block den Input-Wert zurücksetzen:

```typescript
} finally {
  setLoading(false);
  // Reset file input so the same or new file can be uploaded again
  const fileInput = document.getElementById('file-upload') as HTMLInputElement;
  if (fileInput) fileInput.value = '';
}
```

Das sorgt dafür, dass nach jedem Upload (erfolgreich oder fehlgeschlagen) der Input sofort wieder bereit ist für den nächsten Upload.

