

# Phase 8b-fix: brandColors.join Crash beheben

## Problem
`briefing.brandColors` kommt als **String** (z.B. `"#FFD700, #1A1A2E"`) aus der AI-Recommendation, nicht als Array. `.join()` auf einem String schlägt fehl.

## Fix

### 1. `generate-universal-script/index.ts` (Zeile 506)
Ersetze `briefing.brandColors?.join(', ')` durch eine sichere Variante:
```typescript
Array.isArray(briefing.brandColors) ? briefing.brandColors.join(', ') : (briefing.brandColors || 'Standard')
```

### 2. `auto-generate-universal-video/index.ts` (Zeile 810)
Gleicher Fix für die zweite Verwendung:
```typescript
Array.isArray(briefing.brandColors) ? briefing.brandColors.join(', ') : (briefing.brandColors || 'professional palette')
```

### 3. Gleicher Fix für `uniqueSellingPoints` (Zeile 498)
Preventiv absichern — auch USPs könnten als String kommen:
```typescript
Array.isArray(briefing.uniqueSellingPoints) ? briefing.uniqueSellingPoints.join(', ') : (briefing.uniqueSellingPoints || '-')
```

## Dateien

| Datei | Änderung |
|-------|----------|
| `generate-universal-script/index.ts` | Safe-guard für brandColors + USPs |
| `auto-generate-universal-video/index.ts` | Safe-guard für brandColors |

Kein S3-Redeploy nötig — nur Edge Function Deployment.

