# Week 1 Implementation: Rate-Limiting + AI Job Queue ✅

## Was wurde implementiert?

### 1. Database Schema (Migration)
✅ **4 neue Tabellen angelegt:**
- `plan_rate_limits`: Plan-basierte Rate-Limit-Konfiguration (Free/Basic/Pro/Enterprise)
- `rate_limit_state`: Tracker für aktuelle Rate-Limit-Status (Leaky Bucket Algorithm)
- `active_ai_jobs`: Tracker für aktive AI-Jobs (Concurrent Job Limits)
- `ai_jobs`: Queue für asynchrone AI-Verarbeitung mit Retry-Logik

✅ **3 Cleanup-Functions:**
- `cleanup_old_rate_limit_states()`: Entfernt alte Rate-Limit-States
- `cleanup_old_ai_jobs()`: Entfernt abgeschlossene Jobs nach 7 Tagen
- `cleanup_stale_active_jobs()`: Entfernt hängende Active-Jobs nach 1 Stunde

### 2. Backend-Components (Edge Functions Shared)

#### `_shared/rate-limiter.ts`
**RateLimiter Klasse mit:**
- `checkAICallLimit()`: Prüft AI-Call Rate-Limit (Leaky Bucket)
- `checkConcurrentJobsLimit()`: Prüft maximale gleichzeitige Jobs
- `registerActiveJob()`: Registriert aktiven Job
- `unregisterActiveJob()`: Entfernt Job nach Completion
- `withRateLimit()`: Middleware-Wrapper für Edge Functions

**Plan-basierte Limits:**
```typescript
- free: 5 AI-Calls/min, 1 concurrent job
- basic: 15 AI-Calls/min, 3 concurrent jobs
- pro: 30 AI-Calls/min, 5 concurrent jobs
- enterprise: unlimited
```

#### `_shared/content-hash.ts`
- `generateContentHash()`: Generiert SHA-256 Hash für Exactly-Once-Guarantees

### 3. AI Queue Worker (`ai-queue-worker/index.ts`)

**Features:**
- Batch-Processing (5 Jobs parallel)
- Exponential Backoff bei Retries (2^retry * 60s)
- Stale-Job-Reset (Jobs älter als 10 Minuten)
- Job-Timeout (5 Minuten max)
- Automatisches Cleanup bei Completion/Failure

**Unterstützte Job-Types:**
- `caption`: generate-caption
- `campaign`: generate-campaign
- `hooks`: generate-hooks
- `carousel`: generate-carousel
- `reel_script`: generate-reel-script
- `reply_suggestions`: generate-reply-suggestions
- `bio`: generate-bio

### 4. Frontend-Components

#### `src/hooks/useAIJobStatus.ts`
Hook zum Monitoren von AI-Job-Status mit:
- Auto-Polling (alle 5 Sekunden)
- Stop-Condition bei Completion/Failure
- Error-Handling

#### `src/components/ai/AIJobStatusBadge.tsx`
UI-Component zum Anzeigen des Job-Status mit Icons und Farben

---

## Wie verwendet man es?

### 1. Edge Function mit Rate-Limiting wrappen

**Beispiel: generate-campaign/index.ts**
```typescript
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { withRateLimit } from '../_shared/rate-limiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve((req) => withRateLimit(req, async (req, rateLimiter) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { user_id, workspace_id, ...input } = await req.json();

  try {
    // Generate unique job ID
    const jobId = crypto.randomUUID();

    // Register as active job
    await rateLimiter.registerActiveJob(user_id, workspace_id, jobId, 'campaign');

    try {
      // Your AI generation logic here...
      const result = await generateCampaign(input);

      return new Response(JSON.stringify(result), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } finally {
      // Always unregister job
      await rateLimiter.unregisterActiveJob(jobId);
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}));
```

### 2. AI-Job in Queue einreihen (bei Timeout)

**Wenn AI-Call länger als 10s dauert:**
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Create AI job for background processing
const { data: job } = await supabase
  .from('ai_jobs')
  .insert({
    user_id,
    workspace_id,
    job_type: 'campaign',
    input_data: input,
    priority: 5 // 1=highest, 10=lowest
  })
  .select()
  .single();

// Register as active job
await rateLimiter.registerActiveJob(user_id, workspace_id, job.id, 'campaign');

// Return 202 Accepted
return new Response(JSON.stringify({
  status: 'queued',
  job_id: job.id,
  message: 'Campaign generation queued. Check back in a minute.'
}), {
  status: 202,
  headers: { 
    'Content-Type': 'application/json',
    'X-Job-ID': job.id
  }
});
```

### 3. Frontend: Job-Status monitoren

**In React-Component:**
```tsx
import { useAIJobStatus } from '@/hooks/useAIJobStatus';
import { AIJobStatusBadge } from '@/components/ai/AIJobStatusBadge';

function CampaignGenerator() {
  const [jobId, setJobId] = useState<string | null>(null);
  const { job, isLoading } = useAIJobStatus(jobId);

  const generateCampaign = async () => {
    const response = await supabase.functions.invoke('generate-campaign', {
      body: { /* ... */ }
    });

    if (response.status === 202) {
      // Job was queued
      const { job_id } = await response.json();
      setJobId(job_id);
    } else if (response.status === 200) {
      // Immediate result
      const result = await response.json();
      // Handle result...
    }
  };

  return (
    <div>
      <button onClick={generateCampaign}>Generate Campaign</button>
      
      {job && (
        <div>
          <AIJobStatusBadge 
            status={job.status} 
            retryCount={job.retry_count} 
          />
          
          {job.status === 'completed' && (
            <div>Result: {JSON.stringify(job.result_data)}</div>
          )}
          
          {job.status === 'failed' && (
            <div>Error: {job.error_message}</div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Rate-Limit Response Handling

### 429 Too Many Requests Response
```json
{
  "error": "Rate limit exceeded",
  "retry_after_seconds": 45,
  "message": "Too many AI calls. Please wait 45 seconds.",
  "plan": "free"
}
```

**Frontend Handling:**
```typescript
const response = await supabase.functions.invoke('generate-campaign', { body: input });

if (response.status === 429) {
  const { retry_after_seconds, plan } = await response.json();
  toast.error(`Rate-Limit erreicht. Bitte warte ${retry_after_seconds}s. (Plan: ${plan})`);
  return;
}
```

---

## Deployment

### Worker als Cron-Job aktivieren

**Option 1: Cron-basiert (alle 2 Minuten):**

Füge in `supabase/config.toml` hinzu:
```toml
[functions.ai-queue-worker]
verify_jwt = false

[[functions.ai-queue-worker.schedule]]
expression = "*/2 * * * *"  # Every 2 minutes
```

**Option 2: Kontinuierlich (Long-Polling):**

Für 1000+ User empfohlen: Separate Deno Deploy Instance mit while-Loop

---

## Monitoring

### PostHog Events (Woche 2)
- `ai_job_queued`: Job wurde in Queue eingereiht
- `ai_job_completed`: Job erfolgreich abgeschlossen
- `ai_job_failed`: Job fehlgeschlagen nach max retries
- `rate_limit_hit`: 429 Error returned

### Supabase Queries für Monitoring
```sql
-- Pending Jobs Count
SELECT COUNT(*) FROM ai_jobs WHERE status = 'pending';

-- Average Wait Time
SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) 
FROM ai_jobs 
WHERE status = 'completed' 
AND completed_at > now() - INTERVAL '1 hour';

-- Retry Rate
SELECT 
  COUNT(*) FILTER (WHERE retry_count > 0) * 100.0 / COUNT(*) as retry_rate
FROM ai_jobs
WHERE created_at > now() - INTERVAL '1 hour';

-- Failed Jobs (last hour)
SELECT * FROM ai_jobs 
WHERE status = 'failed' 
AND completed_at > now() - INTERVAL '1 hour'
ORDER BY completed_at DESC;
```

---

## Testing

### Manual Test: Rate-Limiting
```bash
# Teste Rate-Limit (5 Calls als Free-User)
for i in {1..10}; do
  curl -X POST https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/generate-campaign \
    -H "Authorization: Bearer YOUR_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"topic": "Test"}' &
done
```

Erwartung: Die ersten 5 Requests gehen durch, ab dem 6. Request → 429

### Manual Test: Job-Queue
```bash
# Erstelle einen Test-Job
curl -X POST https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/ai-queue-worker \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

Erwartung: Worker verarbeitet pending Jobs

---

## Next Steps (Woche 2-4)

- [ ] **Woche 2**: Telemetrie mit PostHog + Database-Indexes
- [ ] **Woche 3**: Circuit-Breaker + Exactly-Once Posting
- [ ] **Woche 4**: k6 Load-Tests + CDN + Feature Flags

---

## Troubleshooting

### Problem: Rate-Limit greift nicht
**Lösung:** Prüfe ob `profiles.plan` Spalte existiert und korrekt gesetzt ist:
```sql
SELECT id, plan FROM profiles WHERE id = 'user_id';
```

### Problem: Jobs bleiben in "processing" hängen
**Lösung:** Manuelles Reset:
```sql
UPDATE ai_jobs 
SET status = 'pending', processing_started_at = NULL
WHERE status = 'processing' 
AND processing_started_at < now() - INTERVAL '10 minutes';
```

### Problem: Worker läuft nicht
**Lösung:** Prüfe Logs:
```bash
supabase functions logs ai-queue-worker
```

---

## Performance Metrics (Ziel)

- ✅ **P95 Latenz**: < 800ms für AI-Calls
- ✅ **Rate-Limit Hit-Rate**: < 5% aller Requests
- ✅ **Queue Throughput**: 100+ Jobs/Minute
- ✅ **Retry-Rate**: < 10% aller Jobs

---

**Status: ✅ WEEK 1 COMPLETE**

Nächste Schritte: Woche 2 (Telemetrie + Database-Optimierung) oder Testing der aktuellen Implementation.
