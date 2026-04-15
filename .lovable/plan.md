

## Plan: Fix `defaultRole is not defined` Fehler in universal-video-consultant

### Problem
Die Edge Function `universal-video-consultant` crasht mit `ReferenceError: defaultRole is not defined` (Zeile 1834). 

**Ursache**: Das Category-Mapping wandelt `product-ad` → `product-video` und `corporate-ad` → `advertisement` um, aber `categoryRoles` hat keine Einträge für diese internen Keys. Der Fallback `defaultRole` wurde nie definiert.

### Lösung

**`supabase/functions/universal-video-consultant/index.ts`** — zwei Änderungen:

1. **`defaultRole` definieren** (vor Zeile 1834):
```typescript
const defaultRole: Record<Lang, string> = {
  de: 'Du bist Max, dein Video-Marketing-Stratege. Du hilfst beim Erstellen eines professionellen Videos.',
  en: 'You are Max, a video marketing strategist. You help create a professional video.',
  es: 'Eres Max, un estratega de video marketing. Ayudas a crear un video profesional.',
};
```

2. **`categoryRoles` um die gemappten Keys ergänzen** (nach den bestehenden Einträgen):
```typescript
'advertisement': {
  de: 'Du bist Max, ein erfahrener Werbefilm-Regisseur und Marketing-Stratege. Du erstellst eine UNTERNEHMENSWERBUNG — fokussiere auf Markenpositionierung, USPs und emotionale Wirkung.',
  en: 'You are Max, an experienced advertising director and marketing strategist. You are creating a CORPORATE AD — focus on brand positioning, USPs and emotional impact.',
  es: 'Eres Max, un experimentado director publicitario y estratega de marketing. Estás creando un ANUNCIO CORPORATIVO — enfócate en posicionamiento de marca, USPs e impacto emocional.',
},
'product-video': {
  de: 'Du bist Max, ein erfahrener Produkt-Werbefilm-Regisseur und Verkaufspsychologie-Experte. Du erstellst eine PRODUKTWERBUNG — fokussiere auf Produktvorteile, Zielgruppe und Kaufmotivation.',
  en: 'You are Max, an experienced product advertising director and sales psychology expert. You are creating a PRODUCT AD — focus on product benefits, target audience and purchase motivation.',
  es: 'Eres Max, un experimentado director de publicidad de productos y experto en psicología de ventas. Estás creando un ANUNCIO DE PRODUCTO — enfócate en beneficios del producto, audiencia objetivo y motivación de compra.',
},
```

3. **Edge Function deployen**

### Ergebnis
- Produktwerbung-Interview funktioniert ohne Fehler
- Jede Kategorie bekommt den richtigen Persona-Prompt

