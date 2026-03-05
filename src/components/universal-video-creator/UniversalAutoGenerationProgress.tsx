import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, FileText, Image, Mic, Music, Video, AlertCircle, Hand, Sparkles, Crown, RefreshCw, Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { VIDEO_CATEGORIES, type VideoCategory, type UniversalConsultationResult } from '@/types/universal-video-creator';

interface UniversalAutoGenerationProgressProps {
  consultationResult: UniversalConsultationResult;
  category: VideoCategory;
  userId: string;
  onComplete: (project: any) => void;
  onSwitchToManual: (partialProject: any) => void;
  onRetry?: () => void;
  onRateLimitRetry?: () => void;
  diagnosticProfile?: string; // A=Full, B=noMorph, C=noIcons, D=noCharacter
}

// Rate-limit / concurrency errors should NOT advance the diagnostic profile
const isRateLimitError = (msg: string): boolean =>
  /rate exceeded|concurrency limit|throttl/i.test(msg);

type GenerationStep = 'script' | 'character-sheet' | 'visuals' | 'voiceover' | 'music' | 'rendering';

interface StepConfig {
  id: GenerationStep;
  label: string;
  description: string;
  icon: any;
}

const FORMAT_LABELS: Record<string, { label: string; description: string }> = {
  '9:16': { label: '9:16', description: 'TikTok / Reels' },
  '1:1': { label: '1:1', description: 'Instagram Feed' },
  '4:5': { label: '4:5', description: 'Instagram Portrait' },
  '16:9': { label: '16:9', description: 'YouTube / Website' },
};

function buildSteps(aspectRatio?: string): StepConfig[] {
  const format = FORMAT_LABELS[aspectRatio || '16:9'] || FORMAT_LABELS['16:9'];
  return [
    { id: 'script', label: 'Drehbuch', description: 'KI generiert Drehbuch', icon: FileText },
    { id: 'character-sheet', label: 'Charakter', description: 'Character Sheet erstellen', icon: Image },
    { id: 'visuals', label: 'Visuals', description: 'Premium Szenen-Bilder', icon: Image },
    { id: 'voiceover', label: 'Voice-Over', description: 'Professionelle Sprachausgabe', icon: Mic },
    { id: 'music', label: 'Musik', description: 'Passende Hintergrundmusik', icon: Music },
    { id: 'rendering', label: format.label, description: format.description, icon: Video },
  ];
}

// Map backend current_step values to UI step indices
const STEP_TO_INDEX: Record<string, number> = {
  'pending': 0,
  'initializing': 0,
  'generating_script': 0,
  'script_complete': 0,
  'generating_character': 1,
  'character_complete': 1,
  'generating_visuals': 2,
  'visuals_complete': 2,
  'generating_voiceover': 3,
  'voiceover_complete': 3,
  'generating_subtitles': 3,
  'subtitles_complete': 3,
  'selecting_music': 4,
  'music_complete': 4,
  'analyzing_beats': 4,
  'beats_complete': 4,
  'ready_to_render': 5,
  'rendering': 5,
  'render_started': 5,
  'completed': 5,
  'failed': 0,
};

export function UniversalAutoGenerationProgress({ 
  consultationResult, 
  category,
  userId, 
  onComplete, 
  onSwitchToManual,
  onRetry,
  onRateLimitRetry,
  diagnosticProfile = 'A',
}: UniversalAutoGenerationProgressProps) {
  const categoryInfo = VIDEO_CATEGORIES.find(c => c.category === category);
  
  console.log('[UniversalAutoGen] consultationResult keys:', Object.keys(consultationResult || {}));
  console.log('[UniversalAutoGen] aspectRatio:', consultationResult?.aspectRatio, 'format:', (consultationResult as any)?.format, 'outputFormats:', consultationResult?.outputFormats);
  
  const selectedAspectRatio = consultationResult?.aspectRatio 
    || (consultationResult as any)?.format 
    || (consultationResult?.outputFormats)?.[0]
    || (consultationResult as any)?.recommendation?.aspectRatio
    || (consultationResult as any)?.recommendation?.format
    || '16:9';
  const STEPS = buildSteps(selectedAspectRatio);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<GenerationStep[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [generatedAssets, setGeneratedAssets] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string>('Initialisiere...');
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const progressIdRef = useRef<string | null>(null);
  const channelRef = useRef<any>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const clientRenderPollRef = useRef<number | null>(null);
  const lastDbUpdateRef = useRef<number>(Date.now());
  const renderStartTimeRef = useRef<number | null>(null);
  const invokeInFlightRef = useRef<boolean>(false);
  const invokedRenderIdRef = useRef<string | null>(null);
  const retryTriggeredRef = useRef<boolean>(false);
  const rateLimitRetryCountRef = useRef<number>(0); // ← Max 3 render-only retries
  const totalRetryCountRef = useRef<number>(0); // ← Global cap: max 5 total retries
  const renderOnlyRetryCountRef = useRef<number>(0); // ← r24: render-only retry counter
  const fullPipelineRestartCountRef = useRef<number>(0); // ← r24: max 1 full restart

  useEffect(() => {
    startAutoGeneration();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (clientRenderPollRef.current) {
        clearInterval(clientRenderPollRef.current);
      }
    };
  }, []);

  const subscribeToProgress = (progressId: string) => {
    console.log('[UniversalAutoGen] Subscribing to progress:', progressId);
    
    const channel = supabase
      .channel(`universal-progress-${progressId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'universal_video_progress',
          filter: `id=eq.${progressId}`
        },
        (payload) => {
          console.log('[UniversalAutoGen] Progress update:', payload.new);
          handleProgressUpdate(payload.new as any);
        }
      )
      .subscribe((status) => {
        console.log('[UniversalAutoGen] Subscription status:', status);
        if (status !== 'SUBSCRIBED') {
          startFallbackPolling(progressId);
        }
      });
    
    channelRef.current = channel;
    startFallbackPolling(progressId);
  };

  const startFallbackPolling = (progressId: string) => {
    if (pollIntervalRef.current) return;
    
    console.log('[UniversalAutoGen] 🔄 Starting fallback polling for:', progressId);
    
    // Initial fetch
    (async () => {
      const { data } = await supabase
        .from('universal_video_progress')
        .select('*')
        .eq('id', progressId)
        .single();
      if (data) {
        console.log('[UniversalAutoGen] 📊 Initial progress fetch:', data.current_step, data.progress_percent);
        handleProgressUpdate(data);
      }
    })();
    
    // Poll every 1 second
    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('universal_video_progress')
          .select('*')
          .eq('id', progressId)
          .single();
        
        if (data && !error) {
          console.log('[UniversalAutoGen] 📊 Poll update:', data.current_step, data.progress_percent + '%');
          handleProgressUpdate(data);
        }
      } catch (e) {
        console.error('[UniversalAutoGen] Polling error:', e);
      }
    }, 1000);
  };

  const handleProgressUpdate = (data: any) => {
    lastDbUpdateRef.current = Date.now();
    const stepIndex = STEP_TO_INDEX[data.current_step] ?? 0;
    setCurrentStepIndex(stepIndex);
    setProgress(prev => Math.max(prev, data.progress_percent || 0));
    setStatusMessage(data.status_message || 'Verarbeite...');
    
    const completed: GenerationStep[] = [];
    for (let i = 0; i < stepIndex; i++) {
      completed.push(STEPS[i].id);
    }
    setCompletedSteps(completed);
    
    // Parse result_data for assets
    if (data.result_data && typeof data.result_data === 'object') {
      const resultData = data.result_data as any;
      if (resultData.assets && Array.isArray(resultData.assets)) {
        const assetMap: Record<string, string> = {};
        resultData.assets.forEach((asset: any, idx: number) => {
          if (asset.imageUrl) {
            assetMap[`scene-${idx}`] = asset.imageUrl;
          }
        });
        setGeneratedAssets(assetMap);
      }
      
      // ✅ ZWEI-PHASEN: Client erkennt 'ready_to_render' und ruft invoke-remotion-render direkt auf
      // PRIORITÄT: ready_to_render wird IMMER vor rendering behandelt
      if (data.current_step === 'ready_to_render' && resultData.lambdaPayload) {
        // Guard: Bereits für diese renderId gestartet?
        if (invokedRenderIdRef.current === resultData.renderId || invokeInFlightRef.current) {
          console.log('[UniversalAutoGen] ⏭️ Invocation already in-flight or completed for:', resultData.renderId);
          return;
        }
        // Falls fälschlich schon Polling läuft: stoppen
        if (clientRenderPollRef.current) {
          console.log('[UniversalAutoGen] 🛑 Stopping premature render polling before invocation');
          clearInterval(clientRenderPollRef.current);
          clientRenderPollRef.current = null;
        }
        console.log('[UniversalAutoGen] 🚀 Phase 2: Client invokes invoke-remotion-render directly');
        invokeRenderFromClient(resultData.lambdaPayload, resultData.renderId, resultData.progressId || data.id || progressIdRef.current);
        return; // Don't process further until render invocation completes
      }
      
      // Start client-side render polling ONLY if we actually invoked the render
      if (resultData.renderId && (data.current_step === 'rendering' || data.current_step === 'render_started') 
          && !clientRenderPollRef.current && invokedRenderIdRef.current === resultData.renderId) {
        startClientRenderPolling(resultData.renderId, data.id || progressIdRef.current);
      }
    }
    
    if (data.status === 'failed') {
      // ✅ STALE-RUN GUARD: Only show error if it belongs to the CURRENT render
      const resultData = data.result_data as any;
      const failedRenderId = resultData?.renderId;
      const currentRenderId = invokedRenderIdRef.current;
      
      // If we have a current render ID and the failed one doesn't match, skip
      if (currentRenderId && failedRenderId && currentRenderId !== failedRenderId) {
        console.log('[UniversalAutoGen] ⏭️ Ignoring stale failure from old render:', failedRenderId, 'current:', currentRenderId);
        return;
      }
      
      const failMsg = data.status_message || 'Ein Fehler ist aufgetreten';
      
      // ✅ USE errorCategory from result_data if available (set by backend)
      const backendCategory = resultData?.errorCategory;
      const effectiveCategory = backendCategory || (isRateLimitError(failMsg) ? 'rate_limit' : 
        (/reading '(length|0)'|reading "(length|0)"|getrealframerange/i.test(failMsg) ? 'lambda_crash' : 'unknown'));
      
      console.log(`[UniversalAutoGen] 🏷️ Pipeline error category: ${effectiveCategory} (backend: ${backendCategory || 'none'})`);
      
      // ✅ GLOBAL RETRY CAP: Stop after 5 total retries to prevent endless loops
      totalRetryCountRef.current++;
      if (totalRetryCountRef.current > 5) {
        console.log(`[UniversalAutoGen] 🛑 Global retry cap reached (${totalRetryCountRef.current}), stopping`);
        setError('Maximale Anzahl an Versuchen erreicht. Bitte warte einige Minuten und versuche es dann manuell erneut.');
        setProgress(0);
        setIsGenerating(false);
        stopAllPolling();
        return;
      }
      
      // ✅ r24: RENDER-ONLY RETRY for infrastructure errors (timeout, rate_limit, lambda_crash)
      // Reuses existing assets (images, voiceover, music) — saves ~$0.50/retry
      if ((effectiveCategory === 'rate_limit' || effectiveCategory === 'timeout' || effectiveCategory === 'lambda_crash') && !retryTriggeredRef.current) {
        if (renderOnlyRetryCountRef.current < 3 && progressIdRef.current) {
          retryTriggeredRef.current = true;
          renderOnlyRetryCountRef.current++;
          const waitSec = effectiveCategory === 'timeout' ? 45 : effectiveCategory === 'rate_limit' ? 60 : 15;
          const label = effectiveCategory === 'timeout' ? 'Timeout' : effectiveCategory === 'rate_limit' ? 'Rate-limit' : 'Lambda-Crash';
          console.log(`[UniversalAutoGen] 🔄 r24 Render-Only Retry (${label}, attempt ${renderOnlyRetryCountRef.current}/3), waiting ${waitSec}s`);
          setError(null);
          setStatusMessage(`🔄 ${label} — Render-Only Retry in ${waitSec}s (${renderOnlyRetryCountRef.current}/3)... Assets werden wiederverwendet.`);
          setProgress(0);
          stopAllPolling();
          setTimeout(() => {
            startRenderOnlyRetry();
          }, waitSec * 1000);
          return;
        }
        // Exhausted render-only retries
        setError(`Maximale Render-Retries erreicht (3/3). Das Video konnte nicht gerendert werden. Bitte versuche es später erneut.`);
        setProgress(0);
        setIsGenerating(false);
        stopAllPolling();
        return;
      }

      // Unknown errors — show to user, no auto-retry
      setError(failMsg);
      setProgress(0);
      setIsGenerating(false);
      stopAllPolling();
    }
    
    if (data.status === 'completed' && data.result_data) {
      setProject(data.result_data);
      setIsGenerating(false);
      stopAllPolling();
      onComplete(data.result_data);
    }
  };

  const stopAllPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (clientRenderPollRef.current) {
      clearInterval(clientRenderPollRef.current);
      clientRenderPollRef.current = null;
    }
  };

  // ✅ r24: RENDER-ONLY RETRY — reuses existing assets, only re-renders
  const startRenderOnlyRetry = async () => {
    const existingProgressId = progressIdRef.current;
    if (!existingProgressId) {
      console.error('[UniversalAutoGen] ❌ No progressId for render-only retry');
      setError('Render-Only Retry nicht möglich — kein Progress vorhanden.');
      setIsGenerating(false);
      return;
    }
    
    console.log(`[UniversalAutoGen] 🔄 r24: Starting render-only retry for progress: ${existingProgressId}`);
    setIsGenerating(true);
    setError(null);
    setStatusMessage('🔄 Render-Only Retry — Assets werden wiederverwendet...');
    setProgress(0);
    retryTriggeredRef.current = false;
    invokeInFlightRef.current = false;
    invokedRenderIdRef.current = null;
    
    try {
      const response = await supabase.functions.invoke('auto-generate-universal-video', {
        body: {
          userId,
          renderOnly: true,
          existingProgressId,
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      const data = response.data;
      if (data.progressId) {
        console.log(`[UniversalAutoGen] 🔄 Render-only got new progressId: ${data.progressId}`);
        progressIdRef.current = data.progressId;
        subscribeToProgress(data.progressId);
      }
    } catch (err) {
      console.error('[UniversalAutoGen] ❌ Render-only retry failed:', err);
      setError(`Render-Only Retry fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
      setIsGenerating(false);
    }
  };

  // ✅ Phase 2: Client ruft invoke-remotion-render direkt auf (idempotent)
  const invokeRenderFromClient = async (lambdaPayload: any, renderId: string, progressId: string) => {
    // Double-check guards
    if (invokeInFlightRef.current || invokedRenderIdRef.current === renderId) {
      console.log('[UniversalAutoGen] ⏭️ Skipping duplicate invocation for:', renderId);
      return;
    }
    invokeInFlightRef.current = true;
    
    try {
      console.log('[UniversalAutoGen] 🎬 Calling invoke-remotion-render from client...');
      setStatusMessage('🎬 Starte Video-Rendering...');
      
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) {
        throw new Error('Nicht authentifiziert');
      }
      
      const response = await supabase.functions.invoke('invoke-remotion-render', {
        body: {
          lambdaPayload,
          pendingRenderId: renderId,
          userId: session.session.user.id,
          progressId,
        }
      });
      
      if (response.error) {
        console.error('[UniversalAutoGen] ❌ invoke-remotion-render error:', response.error);
        throw new Error(response.error.message || 'Render-Start fehlgeschlagen');
      }
      
      console.log('[UniversalAutoGen] ✅ invoke-remotion-render success:', response.data);
      invokedRenderIdRef.current = renderId;
      
      // Start polling for render completion
      startClientRenderPolling(renderId, progressId);
      
    } catch (err) {
      console.error('[UniversalAutoGen] ❌ Client render invocation failed:', err);
      
      // ✅ Optimistic fallback: Lambda may have started despite network/timeout error
      // Don't hard-fail — start polling anyway, the render might succeed
      const isFetchError = err instanceof Error && (
        err.message.includes('FunctionsFetchError') || 
        err.message.includes('Failed to fetch') ||
        err.message.includes('CORS') ||
        err.message.includes('NetworkError') ||
        err.message.includes('AbortError') ||
        err.name === 'FunctionsFetchError'
      );
      
      if (isFetchError) {
        console.log('[UniversalAutoGen] 🔄 Network/timeout error — starting optimistic polling');
        setStatusMessage('🎬 Video-Rendering gestartet, überprüfe Status...');
        invokedRenderIdRef.current = renderId;
        startClientRenderPolling(renderId, progressId);
      } else {
        // Clear non-network error (e.g. auth, validation)
        setError(`Rendering konnte nicht gestartet werden: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
        setIsGenerating(false);
        stopAllPolling();
      }
    } finally {
      invokeInFlightRef.current = false;
    }
  };

  const startClientRenderPolling = (renderId: string, progressId: string | null) => {
    if (clientRenderPollRef.current) return;
    
    // Stop DB polling - only ONE source should update progress
    if (pollIntervalRef.current) {
      console.log('[UniversalAutoGen] 🛑 Stopping DB polling, client render polling takes over');
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    renderStartTimeRef.current = Date.now();
    let lastRenderProgress = -1;
    let staleCount = 0;
    console.log('[UniversalAutoGen] 🎬 Starting client-side render polling for:', renderId);
    
    clientRenderPollRef.current = window.setInterval(async () => {
      // Timeout after 15 minutes (complex videos can take 10-15 min)
      if (renderStartTimeRef.current && Date.now() - renderStartTimeRef.current > 15 * 60 * 1000) {
        console.error('[UniversalAutoGen] ⏰ Client-side render polling timeout (15 min)');
        
        // Update progress table so retry button works correctly
        if (progressIdRef.current) {
          try {
            await supabase
              .from('universal_video_progress')
              .update({
                status: 'failed',
                current_step: 'failed',
                status_message: 'Rendering-Timeout nach 15 Minuten',
              })
              .eq('id', progressIdRef.current);
          } catch (e) {
            console.error('[UniversalAutoGen] Failed to update progress on timeout:', e);
          }
        }
        
        setError('Video-Rendering hat das Zeitlimit überschritten (15 Minuten). Credits werden automatisch erstattet. Bitte versuche es erneut.');
        setIsGenerating(false);
        stopAllPolling();
        return;
      }
      
      try {
        const response = await supabase.functions.invoke('check-remotion-progress', {
          body: { renderId, source: 'universal-creator' }
        });
        
        if (response.error) {
          console.warn('[UniversalAutoGen] Check progress error:', response.error);
          return;
        }
        
        const progressData = response.data?.progress || {};
        const { done, outputFile, overallProgress, fatalErrorEncountered, errors, progressSource } = progressData;
        
        if (fatalErrorEncountered) {
          const errorMsg = Array.isArray(errors) 
            ? errors.map((e: any) => typeof e === 'string' ? e : e.message || JSON.stringify(e)).join(', ')
            : 'Render-Fehler';
          
          // ✅ USE errorCategory from backend (structured), fallback to regex
          const backendCategory = progressData.errorCategory;
          const effectiveCategory = backendCategory || (isRateLimitError(errorMsg) ? 'rate_limit' : 
            (/reading '(length|0)'|reading "(length|0)"|getrealframerange/i.test(errorMsg) ? 'lambda_crash' : 'unknown'));
          
          console.log(`[UniversalAutoGen] 🏷️ Error category: ${effectiveCategory} (backend: ${backendCategory || 'none'})`);
          
          // ✅ r24: RENDER-ONLY RETRY for infrastructure errors detected during render polling
          if ((effectiveCategory === 'rate_limit' || effectiveCategory === 'timeout' || effectiveCategory === 'lambda_crash') && !retryTriggeredRef.current) {
            if (renderOnlyRetryCountRef.current < 3 && progressIdRef.current) {
              retryTriggeredRef.current = true;
              renderOnlyRetryCountRef.current++;
              const waitSec = effectiveCategory === 'timeout' ? 45 : effectiveCategory === 'rate_limit' ? 60 : 15;
              const label = effectiveCategory === 'timeout' ? 'Timeout' : effectiveCategory === 'rate_limit' ? 'Rate-limit' : 'Lambda-Crash';
              console.log(`[UniversalAutoGen] 🔄 r24 Render-Only Retry in polling (${label}, attempt ${renderOnlyRetryCountRef.current}/3), waiting ${waitSec}s`);
              setStatusMessage(`🔄 ${label} — Render-Only Retry in ${waitSec}s (${renderOnlyRetryCountRef.current}/3)...`);
              stopAllPolling();
              setTimeout(() => {
                startRenderOnlyRetry();
              }, waitSec * 1000);
              return;
            }
            setError(`Maximale Render-Retries erreicht (3/3). Bitte versuche es später erneut.`);
            setIsGenerating(false);
            stopAllPolling();
            return;
          }
          
          setError(`Rendering fehlgeschlagen: ${errorMsg}`);
          setIsGenerating(false);
          stopAllPolling();
          return;
        }
        
        // Update progress from render (monotonic - never decrease)
        const renderPercent = typeof overallProgress === 'number' ? overallProgress : 0;
        const displayPercent = 90 + Math.floor(renderPercent * 10);
        setProgress(prev => Math.max(prev, displayPercent));
        setStatusMessage(`Rendering... ${Math.floor(renderPercent * 100)}%`);
        
        // Stale progress detection - only for real S3 progress, not time-based estimates
        if (progressSource === 's3-progress-json') {
          // Real progress from S3: detect stale after 10 polls (100 seconds)
          if (renderPercent === lastRenderProgress) {
            staleCount++;
            if (staleCount >= 10) {
              console.error('[UniversalAutoGen] ⚠️ S3 render progress stale for 10 polls');
              setError('Rendering macht keinen Fortschritt. Credits werden automatisch erstattet. Bitte versuche es erneut.');
              setIsGenerating(false);
              stopAllPolling();
              return;
            }
          } else {
            staleCount = 0;
            lastRenderProgress = renderPercent;
          }
        } else if (progressSource === 'time-based') {
          // Time-based estimate: NO stale detection, rely on 8-minute global timeout
          console.log('[UniversalAutoGen] ⏳ Time-based progress, skipping stale detection');
        } else {
          // Default/unknown: mild stale detection after 15 polls
          if (renderPercent === lastRenderProgress) {
            staleCount++;
            if (staleCount >= 15) {
              console.error('[UniversalAutoGen] ⚠️ Render progress stale for 15 polls');
              setError('Video-Rendering hat das Zeitlimit überschritten. Credits werden automatisch erstattet. Bitte versuche es erneut.');
              setIsGenerating(false);
              stopAllPolling();
              return;
            }
          } else {
            staleCount = 0;
            lastRenderProgress = renderPercent;
          }
        }
        
        if (done && outputFile) {
          console.log('[UniversalAutoGen] ✅ Client-side detected render complete:', outputFile);
          setProgress(100);
          setStatusMessage('Video fertig!');
          setIsGenerating(false);
          stopAllPolling();
          
          // Fetch final data from DB
          if (progressId) {
            const { data: finalData } = await supabase
              .from('universal_video_progress')
              .select('*')
              .eq('id', progressId)
              .single();
            
            if (finalData?.result_data && typeof finalData.result_data === 'object') {
              const mergedResult = { ...(finalData.result_data as Record<string, unknown>), outputUrl: outputFile };
              setProject(mergedResult);
              onComplete(mergedResult);
            } else {
              onComplete({ outputUrl: outputFile });
            }
          } else {
            onComplete({ outputUrl: outputFile });
          }
        }
      } catch (e) {
        console.error('[UniversalAutoGen] Client render polling error:', e);
      }
    }, 10000); // Check every 10 seconds
  };

  const startAutoGeneration = async () => {
    setIsGenerating(true);
    setError(null);
    setStatusMessage('🚀 Starte KI-Generierung...');
    setProgress(0);

    try {
      console.log('[UniversalAutoGen] 🚀 Calling auto-generate-universal-video...');
      
      const response = await supabase.functions.invoke('auto-generate-universal-video', {
        body: {
          consultationResult,
          category,
          userId,
          diagnosticProfile, // ← Pass isolation profile to backend
        }
      });

      console.log('[UniversalAutoGen] Response received:', response.data);

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      
      if (data.progressId) {
        console.log('[UniversalAutoGen] ✅ Got progressId, subscribing immediately:', data.progressId);
        progressIdRef.current = data.progressId;
        subscribeToProgress(data.progressId);
        
        const { data: initialProgress } = await supabase
          .from('universal_video_progress')
          .select('*')
          .eq('id', data.progressId)
          .single();
        
        if (initialProgress) {
          console.log('[UniversalAutoGen] 📊 Initial progress:', initialProgress.current_step, initialProgress.progress_percent + '%');
          handleProgressUpdate(initialProgress);
        }
      }

      if (data.project) {
        setProject(data.project);
        onComplete(data.project);
      }

    } catch (err) {
      console.error('[UniversalAutoGen] ❌ Error:', err);
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
      setIsGenerating(false);
    }
  };

  const handleSwitchToManual = () => {
    onSwitchToManual(project);
  };

  const fetchDebugData = async () => {
    setDebugLoading(true);
    try {
      const response = await supabase.functions.invoke('debug-render-status', {
        body: { progressId: progressIdRef.current }
      });
      setDebugData(response.data);
    } catch (e) {
      setDebugData({ error: e instanceof Error ? e.message : 'Fetch failed' });
    } finally {
      setDebugLoading(false);
    }
  };

  const currentStep = STEPS[currentStepIndex] || STEPS[STEPS.length - 1];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <motion.div 
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F5C76A]/10 border border-[#F5C76A]/30 mb-4"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F5C76A] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F5C76A]" />
          </span>
          <span className="text-sm font-medium text-[#F5C76A]">{categoryInfo?.name} wird erstellt</span>
        </motion.div>
        
        <h2 className="text-3xl font-bold mb-2">
          <span className="bg-gradient-to-r from-[#F5C76A] via-amber-300 to-[#F5C76A] bg-clip-text text-transparent">
            Dein Video wird erstellt
          </span>
        </h2>
        <p className="text-muted-foreground">
          Lehn dich zurück – die KI arbeitet für dich
        </p>
      </motion.div>

      {/* Progress Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 p-4 bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl"
      >
        <div className="flex justify-between text-sm mb-3">
          <span className="text-muted-foreground flex items-center gap-2">
            <Crown className="h-4 w-4 text-[#F5C76A]" />
            {statusMessage}
          </span>
          <span className="text-[#F5C76A] font-bold">{Math.round(progress)}%</span>
        </div>
        <div className="h-3 bg-muted/20 rounded-full overflow-hidden border border-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-[#F5C76A] via-amber-400 to-[#F5C76A] relative"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" 
                 style={{ backgroundSize: '200% 100%' }} />
          </motion.div>
        </div>
      </motion.div>

      {/* Steps Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = index === currentStepIndex && isGenerating;
          const isPending = index > currentStepIndex;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "relative p-4 rounded-xl border backdrop-blur-sm transition-all duration-300",
                isCompleted && "bg-[#F5C76A]/10 border-[#F5C76A]/30 shadow-[0_0_15px_rgba(245,199,106,0.1)]",
                isCurrent && "bg-[#F5C76A]/20 border-[#F5C76A]/50 shadow-[0_0_25px_rgba(245,199,106,0.2)]",
                isPending && "bg-muted/10 border-white/5 opacity-50"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                  isCompleted && "bg-[#F5C76A] text-black",
                  isCurrent && "bg-[#F5C76A]/30 border border-[#F5C76A]/50",
                  isPending && "bg-muted/20 border border-white/10"
                )}>
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : isCurrent ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#F5C76A]" />
                  ) : (
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <span className={cn(
                  "text-sm font-medium",
                  isCompleted && "text-[#F5C76A]",
                  isCurrent && "text-[#F5C76A]"
                )}>{step.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Current Step Detail */}
      <motion.div
        key={currentStepIndex}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#F5C76A]/5 via-transparent to-cyan-500/5 pointer-events-none" />
        
        <div className="flex items-center gap-4 relative">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F5C76A]/20 to-amber-500/10 flex items-center justify-center border border-[#F5C76A]/30">
            {isGenerating ? (
              <Loader2 className="h-6 w-6 text-[#F5C76A] animate-spin" />
            ) : (
              <Sparkles className="h-6 w-6 text-[#F5C76A]" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#F5C76A]">{currentStep.label}</h3>
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          </div>
        </div>

        {/* Show generated visuals preview */}
        {Object.keys(generatedAssets).length > 0 && (
          <div className="mt-6 grid grid-cols-5 gap-2">
            <AnimatePresence>
              {Object.entries(generatedAssets).map(([key, url], index) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="aspect-video rounded-lg overflow-hidden border border-[#F5C76A]/30 shadow-[0_0_10px_rgba(245,199,106,0.1)]"
                >
                  <img src={url} alt={key} className="w-full h-full object-cover" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-6"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="font-medium text-destructive">Fehler bei der Generierung</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                // ✅ Rate-limit errors use same-profile retry
                if (isRateLimitError(error || '') && onRateLimitRetry) {
                  onRateLimitRetry();
                } else if (onRetry) {
                  onRetry();
                } else {
                  setError(null);
                  startAutoGeneration();
                }
              }}
              className="border-destructive/30 hover:bg-destructive/10"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Erneut versuchen
            </Button>
          </div>
        </motion.div>
      )}

      {/* Debug Panel */}
      {(isGenerating || error) && progressIdRef.current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="mb-6"
        >
          <button
            onClick={() => {
              setDebugOpen(!debugOpen);
              if (!debugOpen && !debugData) fetchDebugData();
            }}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Bug className="h-3 w-3" />
            <span>Diagnose</span>
            {debugOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {debugOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="mt-2 p-4 bg-card/60 border border-border rounded-xl text-xs font-mono overflow-auto max-h-80"
            >
              <div className="flex justify-between items-center mb-3">
                <span className="text-muted-foreground">Progress-ID: {progressIdRef.current}</span>
                <Button variant="ghost" size="sm" onClick={fetchDebugData} disabled={debugLoading} className="h-6 px-2 text-xs">
                  {debugLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              </div>

              {debugData ? (
                <div className="space-y-2">
                  {debugData.diagnosis && (
                    <div className="space-y-1">
                      {(debugData.diagnosis as string[]).map((d: string, i: number) => (
                        <div key={i} className={cn(
                          "py-0.5",
                          d.startsWith('❌') && "text-destructive",
                          d.startsWith('⚠️') && "text-yellow-500",
                          d.startsWith('✅') && "text-green-500",
                          d.startsWith('🔴') && "text-destructive font-bold",
                        )}>{d}</div>
                      ))}
                    </div>
                  )}

                  {debugData.render && (
                    <div className="pt-2 border-t border-border">
                      <div>Render Status: <span className="text-foreground">{debugData.render.status}</span></div>
                      <div>Render ID: <span className="text-foreground">{debugData.render.render_id}</span></div>
                      <div>Lambda ID: <span className={debugData.lambdaRenderId ? "text-green-500" : "text-destructive"}>{debugData.lambdaRenderId || 'NULL ⚠️'}</span></div>
                      {debugData.render?.content_config && (
                        <>
                          <div>Tracking Mode: <span className="text-foreground">{(debugData.render.content_config as any)?.tracking_mode || '—'}</span></div>
                          <div>Real Render ID: <span className={((debugData.render.content_config as any)?.real_remotion_render_id) ? "text-green-500" : "text-yellow-500"}>
                            {(debugData.render.content_config as any)?.real_remotion_render_id || 'pending reconciliation'}
                          </span></div>
                          <div>Lambda Fn: <span className="text-foreground">{(debugData.render.content_config as any)?.lambda_function || '—'}</span></div>
                          <div>OutName: <span className="text-foreground">{(debugData.render.content_config as any)?.out_name || '—'}</span></div>
                        </>
                      )}
                          {debugData.render.error_message && <div className="text-destructive">Error: {debugData.render.error_message}</div>}
                          <div>Diag Profile: <span className="text-[#F5C76A] font-bold">{(debugData.render.content_config as any)?.diagnosticProfile || diagnosticProfile || '—'}</span></div>
                          <div>Diag Flags: <span className="text-foreground">{JSON.stringify((debugData.render.content_config as any)?.diag_flags_effective || (debugData.render.content_config as any)?.diag_flags || '—')}</span></div>
                          <div>Payload Hash: <span className="text-foreground">{(debugData.render.content_config as any)?.payload_hash || '—'}</span></div>
                          <div>Updated: {new Date(debugData.render.updated_at).toLocaleTimeString()}</div>
                    </div>
                  )}

                  {debugData.progress && (
                    <div className="pt-2 border-t border-border">
                      <div>Progress Step: <span className="text-foreground">{debugData.progress.current_step}</span></div>
                      <div>Progress %: <span className="text-foreground">{debugData.progress.progress_percent}%</span></div>
                      <div>Status: <span className="text-foreground">{debugData.progress.status}</span></div>
                      <div>Message: <span className="text-foreground">{debugData.progress.status_message}</span></div>
                      <div>Updated: {new Date(debugData.progress.updated_at).toLocaleTimeString()}</div>
                    </div>
                  )}
                </div>
              ) : debugLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Lade Diagnose...
                </div>
              ) : null}
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Switch to Manual */}
      {isGenerating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSwitchToManual}
            className="text-muted-foreground hover:text-foreground"
          >
            <Hand className="h-4 w-4 mr-2" />
            Zum manuellen Modus wechseln
          </Button>
        </motion.div>
      )}
    </div>
  );
}
