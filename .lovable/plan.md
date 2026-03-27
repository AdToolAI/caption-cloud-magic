

## Prompt-Text beim Seitenwechsel beibehalten

### Problem
`prompt` wird mit `useState('')` initialisiert. Bei Navigation zu einer anderen Seite wird die Komponente unmounted und der State geht verloren.

### Lösung
Den `prompt`-State über `sessionStorage` persistieren — analog zum Draft-System des Universal Creators, aber einfacher:

**Datei: `src/pages/AIVideoStudio.tsx`**

1. Initial-State aus `sessionStorage` laden:
```tsx
const [prompt, setPrompt] = useState(() => 
  sessionStorage.getItem('ai-video-prompt') || ''
);
```

2. Bei Änderung in `sessionStorage` schreiben (via `useEffect`):
```tsx
useEffect(() => {
  sessionStorage.setItem('ai-video-prompt', prompt);
}, [prompt]);
```

3. Nach erfolgreicher Generierung den gespeicherten Prompt löschen.

Dasselbe auch für `model`, `duration`, `aspectRatio` und `resolution` anwenden, damit alle Einstellungen erhalten bleiben.

