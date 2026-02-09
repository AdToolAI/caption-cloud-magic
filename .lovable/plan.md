

# Fix: Interview-Fortschritt gegen Seitenneuladung absichern

## Problem

Der gesamte Wizard-Zustand (Kategorie, Modus, aktueller Schritt, Chat-Nachrichten, Fortschritt) lebt ausschliesslich in React `useState`. Bei jedem Seitenrefresh oder Hot-Reload geht alles verloren und der Nutzer landet wieder im Startmenue.

## Loesung: localStorage-Persistierung

Zwei Komponenten muessen ihren Zustand in `localStorage` sichern und beim Laden wiederherstellen:

### Aenderung 1: UniversalVideoWizard.tsx

Persistierte Felder:
- `selectedCategory`
- `generationMode`
- `currentStep`

Beim Start: gespeicherten Zustand aus `localStorage` laden (Key: `universal-video-wizard-state`).
Bei jeder Aenderung: Zustand in `localStorage` schreiben.
Beim Abschluss oder Reset: `localStorage` leeren.

```text
// Beim Laden:
const saved = localStorage.getItem('universal-video-wizard-state');
if (saved) {
  const { category, mode, step } = JSON.parse(saved);
  setSelectedCategory(category);
  setGenerationMode(mode);
  setCurrentStep(step);
}

// Bei Aenderung (useEffect):
useEffect(() => {
  if (selectedCategory || generationMode || currentStep > 0) {
    localStorage.setItem('universal-video-wizard-state', JSON.stringify({
      category: selectedCategory,
      mode: generationMode,
      step: currentStep,
    }));
  }
}, [selectedCategory, generationMode, currentStep]);

// Bei Reset (handleBackToCategory):
localStorage.removeItem('universal-video-wizard-state');
localStorage.removeItem('universal-video-consultant-state');
```

### Aenderung 2: UniversalVideoConsultant.tsx

Persistierte Felder:
- `messages` (Chat-Verlauf)
- `consultationProgress`

Beim Start: gespeicherte Nachrichten aus `localStorage` laden (Key: `universal-video-consultant-state`). Falls vorhanden, diese statt der initialen Begruessung verwenden.
Nach jeder neuen Nachricht: den gesamten Chat-Verlauf und Fortschritt speichern.
Bei Abschluss: `localStorage` leeren.

```text
// Beim Laden (useState Initializer):
const [messages, setMessages] = useState<Message[]>(() => {
  const saved = localStorage.getItem('universal-video-consultant-state');
  if (saved) {
    const { messages: savedMessages, progress } = JSON.parse(saved);
    if (savedMessages?.length > 0) return savedMessages;
  }
  return [initialMessage];
});

// Nach jeder Nachricht (useEffect):
useEffect(() => {
  if (messages.length > 1) {
    localStorage.setItem('universal-video-consultant-state', JSON.stringify({
      messages,
      progress: consultationProgress,
    }));
  }
}, [messages, consultationProgress]);

// Bei Abschluss (onConsultationComplete):
localStorage.removeItem('universal-video-consultant-state');
```

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `UniversalVideoWizard.tsx` | Wizard-Schritt, Kategorie und Modus in localStorage persistieren |
| `UniversalVideoConsultant.tsx` | Chat-Nachrichten und Fortschritt in localStorage persistieren |

Kein Backend noetig -- localStorage reicht fuer Session-Persistenz und ueberlebt Seitenrefreshs zuverlaessig.

