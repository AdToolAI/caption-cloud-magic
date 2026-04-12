import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, FileText, Image, Mic, Music, Video, AlertCircle, Hand, Sparkles, Crown, RefreshCw, Bug, ChevronDown, ChevronUp, Clock, Shield, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { VIDEO_CATEGORIES, type VideoCategory, type UniversalConsultationResult } from '@/types/universal-video-creator';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocalizedCategoryName } from '@/hooks/useLocalizedVideoCategories';

interface UniversalAutoGenerationProgressProps {
  consultationResult: UniversalConsultationResult;
  category: VideoCategory;
  userId: string;
  onComplete: (project: any) => void;
  onSwitchToManual: (partialProject: any) => void;
  onRetry?: () => void;
  onRateLimitRetry?: () => void;
  onMinimize?: () => void;
  diagnosticProfile?: string;
}

const isRateLimitError = (msg: string): boolean =>
  /rate exceeded|concurrency limit|throttl|capacity_cooldown/i.test(msg);

const classifyPipelineError = (resultData: any, statusMessage: string): string => {
  if (resultData?.errorCategory && resultData.errorCategory !== 'unknown') {
    return resultData.errorCategory;
  }
  const msg = (statusMessage || '').toLowerCase();
  if (/rate exceeded|concurrency limit|throttl|capacity_cooldown/i.test(msg)) return 'rate_limit';
  if (/ffprobe.*failed|ffprobe.*exit code|invalid data found.*processing input|failed to find.*mpeg audio|not a valid audio/i.test(msg)) return 'audio_corruption';
  if (/waiting for lottie|delayrender.*lottie|lottie.*animation.*load/i.test(msg)) return 'lambda_crash';
  if (/timeout|zeitlimit|frames pro lambda|120s|600s/i.test(msg)) return 'timeout';
  if (/reading '(length|0)'|reading "(length|0)"|getrealframerange/i.test(msg)) return 'lambda_crash';
  if (/codec|preset|framerange|invalid|schema|zod/i.test(msg)) return 'validation';
  return 'unknown';
};

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

const STEP_TO_INDEX: Record<string, number> = {
  'pending': 0, 'initializing': 0, 'generating_script': 0, 'script_complete': 0,
  'generating_character': 1, 'character_complete': 1,
  'generating_visuals': 2, 'visuals_complete': 2,
  'generating_voiceover': 3, 'voiceover_complete': 3,
  'generating_subtitles': 3, 'subtitles_complete': 3,
  'selecting_music': 4, 'music_complete': 4,
  'analyzing_beats': 4, 'beats_complete': 4,
  'ready_to_render': 5, 'rendering': 5, 'render_started': 5,
  'completed': 5, 'failed': 0,
};

export function UniversalAutoGenerationProgress({ 
  consultationResult, 
  category,
  userId, 
  onComplete, 
  onSwitchToManual,
  onRetry,
  onRateLimitRetry,
  onMinimize,
  diagnosticProfile = 'A',
}: UniversalAutoGenerationProgressProps) {
  const { t, language } = useTranslation();
  const categoryName = useLocalizedCategoryName(category);
  
  const selectedAspectRatio = consultationResult?.aspectRatio 
    || (consultationResult as any)?.format 
    || (consultationResult?.outputFormats)?.[0]
    || (consultationResult as any)?.recommendation?.aspectRatio
    || (consultationResult as any)?.recommendation?.format
    || '16:9';

  function buildSteps(aspectRatio?: string): StepConfig[] {
    const format = FORMAT_LABELS[aspectRatio || '16:9'] || FORMAT_LABELS['16:9'];
    return [
      { id: 'script', label: t('uvc.genScript'), description: t('uvc.genScriptDesc'), icon: FileText },
      { id: 'character-sheet', label: t('uvc.genCharacter'), description: t('uvc.genCharacterDesc'), icon: Image },
      { id: 'visuals', label: t('uvc.genVisualsLabel'), description: t('uvc.genVisualsDesc'), icon: Image },
      { id: 'voiceover', label: t('uvc.genVoiceover'), description: t('uvc.genVoiceoverDesc'), icon: Mic },
      { id: 'music', label: t('uvc.genMusic'), description: t('uvc.genMusicDesc'), icon: Music },
      { id: 'rendering', label: format.label, description: format.description, icon: Video },
    ];
  }

  const STEPS = buildSteps(selectedAspectRatio);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<GenerationStep[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [generatedAssets, setGeneratedAssets] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string>(t('uvc.genInitializing'));
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [capacityCooldown, setCapacityCooldown] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState(0);
  const [retryInfo, setRetryInfo] = useState<{ renderOnlyAttempts: number; totalAttempts: number }>({ renderOnlyAttempts: 0, totalAttempts: 0 });
  
  const progressIdRef = useRef<string | null>(null);
  const channelRef = useRef<any>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const clientRenderPollRef = useRef<number | null>(null);
  const [retryCountdownSec, setRetryCountdownSec] = useState<number>(0);
  const retryCountdownRef = useRef<number | null>(null);
  const lastDbUpdateRef = useRef<number>(Date.now());
  const renderStartTimeRef = useRef<number | null>(null);
  const invokeInFlightRef = useRef<boolean>(false);
  const invokedRenderIdRef = useRef<string | null>(null);
  const retryTriggeredRef = useRef<boolean>(false);
  const renderOnlyRetryCountRef = useRef<number>(0);
  const totalRetryCountRef = useRef<number>(0);
  const lastFailureSignatureRef = useRef<string | null>(null);
  const mountedRef = useRef<boolean>(true);

  const getErrorLabel = (cat: string): string => {
    switch (cat) {
      case 'timeout': return t('uvc.genLabelTimeout');
      case 'rate_limit': return t('uvc.genLabelRateLimit');
      case 'audio_corruption': return t('uvc.genLabelAudioError');
      case 'lambda_crash': return t('uvc.genLabelLambdaCrash');
      default: return cat;
    }
  };

  const cleanupAll = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (clientRenderPollRef.current) { clearInterval(clientRenderPollRef.current); clientRenderPollRef.current = null; }
    if (retryCountdownRef.current) { clearInterval(retryCountdownRef.current); retryCountdownRef.current = null; }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    startAutoGeneration();
    return () => {
      mountedRef.current = false;
      cleanupAll();
    };
  }, []);

  const subscribeToProgress = (progressId: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    
    const channel = supabase
      .channel(`universal-progress-${progressId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'universal_video_progress', filter: `id=eq.${progressId}` },
        (payload) => {
          if (!mountedRef.current) return;
          if (payload.new && (payload.new as any).id !== progressIdRef.current) return;
          handleProgressUpdate(payload.new as any);
        }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') startFallbackPolling(progressId);
      });
    
    channelRef.current = channel;
    startFallbackPolling(progressId);
  };

  const startFallbackPolling = (progressId: string) => {
    if (pollIntervalRef.current) return;
    
    (async () => {
      const { data } = await supabase.from('universal_video_progress').select('*').eq('id', progressId).single();
      if (data && mountedRef.current) handleProgressUpdate(data);
    })();
    
    pollIntervalRef.current = window.setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const currentProgressId = progressIdRef.current;
        if (!currentProgressId) return;
        const { data, error } = await supabase.from('universal_video_progress').select('*').eq('id', currentProgressId).single();
        if (data && !error && mountedRef.current) handleProgressUpdate(data);
      } catch (e) { console.error('[UniversalAutoGen] Polling error:', e); }
    }, 1000);
  };

  const handleProgressUpdate = (data: any) => {
    if (!mountedRef.current) return;
    
    lastDbUpdateRef.current = Date.now();
    const stepIndex = STEP_TO_INDEX[data.current_step] ?? 0;
    setCurrentStepIndex(stepIndex);
    setProgress(prev => Math.max(prev, data.progress_percent || 0));
    setStatusMessage(data.status_message || t('uvc.genProcessing'));
    
    const completed: GenerationStep[] = [];
    for (let i = 0; i < stepIndex; i++) completed.push(STEPS[i].id);
    setCompletedSteps(completed);
    
    if (data.result_data && typeof data.result_data === 'object') {
      const resultData = data.result_data as any;
      if (resultData.assets && Array.isArray(resultData.assets)) {
        const assetMap: Record<string, string> = {};
        resultData.assets.forEach((asset: any, idx: number) => {
          if (asset.imageUrl) assetMap[`scene-${idx}`] = asset.imageUrl;
        });
        setGeneratedAssets(assetMap);
      }
      
      if (data.current_step === 'ready_to_render' && resultData.lambdaPayload) {
        if (invokedRenderIdRef.current === resultData.renderId || invokeInFlightRef.current) return;
        if (clientRenderPollRef.current) { clearInterval(clientRenderPollRef.current); clientRenderPollRef.current = null; }
        invokeRenderFromClient(resultData.lambdaPayload, resultData.renderId, resultData.progressId || data.id || progressIdRef.current);
        return;
      }
      
      if (resultData.renderId && (data.current_step === 'rendering' || data.current_step === 'render_started') 
          && !clientRenderPollRef.current && invokedRenderIdRef.current === resultData.renderId) {
        startClientRenderPolling(resultData.renderId, data.id || progressIdRef.current);
      }
    }
    
    if (data.status === 'failed') {
      const resultData = data.result_data as any;
      const failMsg = data.status_message || t('uvc.genUnknownError');
      const effectiveCategory = classifyPipelineError(resultData, failMsg);
      
      const failedRenderId = resultData?.renderId || resultData?.webhookRenderId;
      const currentRenderId = invokedRenderIdRef.current;
      if (currentRenderId && failedRenderId && currentRenderId !== failedRenderId) return;
      
      const failureSignature = `${failedRenderId || data.id}:${effectiveCategory}:${failMsg.substring(0, 50)}`;
      if (lastFailureSignatureRef.current === failureSignature) return;
      lastFailureSignatureRef.current = failureSignature;
      
      const isRetryableCategory = effectiveCategory === 'rate_limit' || effectiveCategory === 'timeout' || effectiveCategory === 'lambda_crash' || effectiveCategory === 'audio_corruption';
      if (retryTriggeredRef.current && isRetryableCategory) return;
      
      totalRetryCountRef.current++;
      setRetryInfo(prev => ({ ...prev, totalAttempts: totalRetryCountRef.current }));
      
      if (totalRetryCountRef.current > 5) {
        setError(t('uvc.genMaxRetries'));
        setProgress(0);
        setIsGenerating(false);
        cleanupAll();
        return;
      }
      
      if (isRetryableCategory && !retryTriggeredRef.current) {
        if (renderOnlyRetryCountRef.current < 3 && progressIdRef.current) {
          retryTriggeredRef.current = true;
          renderOnlyRetryCountRef.current++;
          setRetryInfo(prev => ({ ...prev, renderOnlyAttempts: renderOnlyRetryCountRef.current }));
          
          const attempt = renderOnlyRetryCountRef.current;
          const waitSec = effectiveCategory === 'rate_limit' ? 60 * attempt : effectiveCategory === 'audio_corruption' ? 5 : 30;
          const label = getErrorLabel(effectiveCategory);
          
          setError(null);
          setProgress(0);
          cleanupAll();
          
          setRetryCountdownSec(waitSec);
          setStatusMessage(t('uvc.genAutoRetryLabel', { label, sec: String(waitSec), attempt: String(attempt) }));
          
          retryCountdownRef.current = window.setInterval(() => {
            setRetryCountdownSec(prev => {
              if (prev <= 1) {
                if (retryCountdownRef.current) { clearInterval(retryCountdownRef.current); retryCountdownRef.current = null; }
                return 0;
              }
              const next = prev - 1;
              setStatusMessage(t('uvc.genAutoRetryLabel', { label, sec: String(next), attempt: String(attempt) }));
              return next;
            });
          }, 1000);
          
          setTimeout(() => { if (mountedRef.current) startRenderOnlyRetry(); }, waitSec * 1000);
          return;
        }
        setCapacityCooldown(true);
        setCooldownMinutes(10);
        setError(null);
        setIsGenerating(false);
        cleanupAll();
        return;
      }

      setError(failMsg);
      setProgress(0);
      setIsGenerating(false);
      cleanupAll();
    }
    
    if (data.status === 'completed' && data.result_data) {
      setProject(data.result_data);
      setIsGenerating(false);
      cleanupAll();
      onComplete(data.result_data);
    }
  };

  const stopAllPolling = () => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (clientRenderPollRef.current) { clearInterval(clientRenderPollRef.current); clientRenderPollRef.current = null; }
  };

  const startRenderOnlyRetry = async () => {
    const existingProgressId = progressIdRef.current;
    if (!existingProgressId) {
      setError(t('uvc.genRenderOnlyNotPossible'));
      setIsGenerating(false);
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    setCapacityCooldown(false);
    setStatusMessage(t('uvc.genRenderOnlyRetrying'));
    setProgress(0);
    retryTriggeredRef.current = false;
    invokeInFlightRef.current = false;
    invokedRenderIdRef.current = null;
    lastFailureSignatureRef.current = null;
    
    try {
      const response = await supabase.functions.invoke('auto-generate-universal-video', {
        body: { userId, renderOnly: true, existingProgressId }
      });
      
      if (response.error) {
        let parsedBody: any = null;
        try {
          const ctx = (response.error as any)?.context;
          if (ctx && typeof ctx.json === 'function') parsedBody = await ctx.json();
          else if (ctx && typeof ctx.status === 'number') parsedBody = { _status: ctx.status };
        } catch { }
        
        const isCapacityCooldown = parsedBody?.error === 'capacity_cooldown' || response.data?.error === 'capacity_cooldown' || (parsedBody?._status === 429);
        if (isCapacityCooldown) {
          const cooldown = parsedBody?.cooldownMinutes || response.data?.cooldownMinutes || 10;
          setCapacityCooldown(true);
          setCooldownMinutes(cooldown);
          setIsGenerating(false);
          return;
        }
        
        const backendErrorCode = parsedBody?.error || response.data?.error;
        if (backendErrorCode === 'render_only_source_missing_payload') {
          setError(t('uvc.genRenderPayloadMissing'));
          setIsGenerating(false);
          return;
        }
        
        throw new Error(parsedBody?.message || (response.error as any)?.message || 'Render-only retry failed');
      }
      
      const data = response.data;
      if (data?.error === 'capacity_cooldown') {
        setCapacityCooldown(true);
        setCooldownMinutes(data.cooldownMinutes || 10);
        setIsGenerating(false);
        return;
      }
      
      if (data?.progressId) {
        progressIdRef.current = data.progressId;
        subscribeToProgress(data.progressId);
      }
    } catch (err) {
      console.error('[UniversalAutoGen] ❌ Render-only retry failed:', err);
      setError(t('uvc.genRenderOnlyFailed', { msg: err instanceof Error ? err.message : 'Unknown' }));
      setIsGenerating(false);
    }
  };

  const invokeRenderFromClient = async (lambdaPayload: any, renderId: string, progressId: string) => {
    if (invokeInFlightRef.current || invokedRenderIdRef.current === renderId) return;
    invokeInFlightRef.current = true;
    
    try {
      setStatusMessage(t('uvc.genStartingRender'));
      
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) throw new Error(t('uvc.genNotAuthenticated'));
      
      const response = await supabase.functions.invoke('invoke-remotion-render', {
        body: { lambdaPayload, pendingRenderId: renderId, userId: session.session.user.id, progressId }
      });
      
      if (response.error) throw new Error(response.error.message || t('uvc.genRenderStartFailed'));
      
      invokedRenderIdRef.current = renderId;
      startClientRenderPolling(renderId, progressId);
    } catch (err) {
      const isFetchError = err instanceof Error && (
        err.message.includes('FunctionsFetchError') || err.message.includes('Failed to fetch') ||
        err.message.includes('CORS') || err.message.includes('NetworkError') ||
        err.message.includes('AbortError') || err.name === 'FunctionsFetchError'
      );
      
      if (isFetchError) {
        setStatusMessage(t('uvc.genNetworkError'));
        invokedRenderIdRef.current = renderId;
        startClientRenderPolling(renderId, progressId);
      } else {
        setError(t('uvc.genRenderCouldNotStart', { msg: err instanceof Error ? err.message : 'Unknown' }));
        setIsGenerating(false);
        cleanupAll();
      }
    } finally {
      invokeInFlightRef.current = false;
    }
  };

  const startClientRenderPolling = (renderId: string, progressId: string | null) => {
    if (clientRenderPollRef.current) return;
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    
    renderStartTimeRef.current = Date.now();
    let lastRenderProgress = -1;
    let staleCount = 0;
    
    clientRenderPollRef.current = window.setInterval(async () => {
      if (!mountedRef.current) return;
      
      if (renderStartTimeRef.current && Date.now() - renderStartTimeRef.current > 15 * 60 * 1000) {
        if (progressIdRef.current) {
          try {
            await supabase.from('universal_video_progress').update({
              status: 'failed', current_step: 'failed', status_message: t('uvc.genRenderTimeoutMsg'),
            }).eq('id', progressIdRef.current);
          } catch (e) { }
        }
        setError(t('uvc.genRenderTimeout'));
        setIsGenerating(false);
        cleanupAll();
        return;
      }
      
      try {
        const response = await supabase.functions.invoke('check-remotion-progress', {
          body: { renderId, source: 'universal-creator' }
        });
        if (response.error) return;
        
        const progressData = response.data?.progress || {};
        const { done, outputFile, overallProgress, fatalErrorEncountered, errors, progressSource } = progressData;
        
        if (fatalErrorEncountered) {
          const errorMsg = Array.isArray(errors) 
            ? errors.map((e: any) => typeof e === 'string' ? e : e.message || JSON.stringify(e)).join(', ')
            : t('uvc.genRenderStartFailed');
          
          const effectiveCategory = classifyPipelineError(progressData, errorMsg);
          const pollingFailSig = `poll:${renderId}:${effectiveCategory}:${errorMsg.substring(0, 50)}`;
          if (lastFailureSignatureRef.current === pollingFailSig) return;
          lastFailureSignatureRef.current = pollingFailSig;
          
          const isRetryableCategory = effectiveCategory === 'rate_limit' || effectiveCategory === 'timeout' || effectiveCategory === 'lambda_crash' || effectiveCategory === 'audio_corruption';
          if (retryTriggeredRef.current && isRetryableCategory) return;
          
          if (isRetryableCategory && !retryTriggeredRef.current) {
            if (renderOnlyRetryCountRef.current < 3 && progressIdRef.current) {
              retryTriggeredRef.current = true;
              renderOnlyRetryCountRef.current++;
              totalRetryCountRef.current++;
              setRetryInfo({ renderOnlyAttempts: renderOnlyRetryCountRef.current, totalAttempts: totalRetryCountRef.current });
              
              const attempt = renderOnlyRetryCountRef.current;
              const waitSec = effectiveCategory === 'rate_limit' ? 60 * attempt : effectiveCategory === 'audio_corruption' ? 5 : 30;
              const label = getErrorLabel(effectiveCategory);
              
              setError(null);
              setProgress(0);
              cleanupAll();
              
              setRetryCountdownSec(waitSec);
              setStatusMessage(t('uvc.genAutoRetryLabel', { label, sec: String(waitSec), attempt: String(attempt) }));
              
              retryCountdownRef.current = window.setInterval(() => {
                setRetryCountdownSec(prev => {
                  if (prev <= 1) {
                    if (retryCountdownRef.current) { clearInterval(retryCountdownRef.current); retryCountdownRef.current = null; }
                    return 0;
                  }
                  const next = prev - 1;
                  setStatusMessage(t('uvc.genAutoRetryLabel', { label, sec: String(next), attempt: String(attempt) }));
                  return next;
                });
              }, 1000);
              
              setTimeout(() => { if (mountedRef.current) startRenderOnlyRetry(); }, waitSec * 1000);
              return;
            }
            setCapacityCooldown(true);
            setCooldownMinutes(10);
            setIsGenerating(false);
            cleanupAll();
            return;
          }
          
          setError(t('uvc.genRenderFailed', { msg: errorMsg }));
          setIsGenerating(false);
          cleanupAll();
          return;
        }
        
        const renderPercent = typeof overallProgress === 'number' ? overallProgress : 0;
        const displayPercent = 90 + Math.floor(renderPercent * 10);
        setProgress(prev => Math.max(prev, displayPercent));
        setStatusMessage(t('uvc.genRendPercent', { percent: String(Math.floor(renderPercent * 100)) }));
        
        if (progressSource === 's3-progress-json') {
          if (renderPercent === lastRenderProgress) {
            staleCount++;
            if (staleCount >= 10) {
              setError(t('uvc.genRenderNoProgress'));
              setIsGenerating(false);
              cleanupAll();
              return;
            }
          } else { staleCount = 0; lastRenderProgress = renderPercent; }
        } else if (progressSource === 'time-based') {
          // No stale detection
        } else {
          if (renderPercent === lastRenderProgress) {
            staleCount++;
            if (staleCount >= 15) {
              setError(t('uvc.genRenderTimeLimitExceeded'));
              setIsGenerating(false);
              cleanupAll();
              return;
            }
          } else { staleCount = 0; lastRenderProgress = renderPercent; }
        }
        
        if (done && outputFile) {
          setProgress(100);
          setStatusMessage(t('uvc.genVideoReady'));
          setIsGenerating(false);
          cleanupAll();
          
          if (progressId) {
            const { data: finalData } = await supabase.from('universal_video_progress').select('*').eq('id', progressId).single();
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
    }, 10000);
  };

  const startAutoGeneration = async () => {
    setIsGenerating(true);
    setError(null);
    setCapacityCooldown(false);
    setStatusMessage(t('uvc.genStartingAI'));
    setProgress(0);

    try {
      const response = await supabase.functions.invoke('auto-generate-universal-video', {
        body: { consultationResult, category, userId, diagnosticProfile, language }
      });

      if (response.error) {
        let parsedBody: any = null;
        try {
          const ctx = (response.error as any)?.context;
          if (ctx && typeof ctx.json === 'function') parsedBody = await ctx.json();
          else if (ctx && typeof ctx.status === 'number') parsedBody = { _status: ctx.status };
        } catch { }
        
        const isCapacityCooldown = parsedBody?.error === 'capacity_cooldown' || response.data?.error === 'capacity_cooldown' || (parsedBody?._status === 429);
        if (isCapacityCooldown) {
          setCapacityCooldown(true);
          setCooldownMinutes(parsedBody?.cooldownMinutes || response.data?.cooldownMinutes || 10);
          setIsGenerating(false);
          return;
        }
        throw new Error(parsedBody?.message || (response.error as any)?.message || response.error.message);
      }

      const data = response.data;
      if (data?.error === 'capacity_cooldown') {
        setCapacityCooldown(true);
        setCooldownMinutes(data.cooldownMinutes || 10);
        setIsGenerating(false);
        return;
      }
      
      if (data?.progressId) {
        progressIdRef.current = data.progressId;
        subscribeToProgress(data.progressId);
        const { data: initialProgress } = await supabase.from('universal_video_progress').select('*').eq('id', data.progressId).single();
        if (initialProgress && mountedRef.current) handleProgressUpdate(initialProgress);
      }
      if (data?.project) { setProject(data.project); onComplete(data.project); }
    } catch (err) {
      console.error('[UniversalAutoGen] ❌ Error:', err);
      setError(err instanceof Error ? err.message : t('uvc.genUnknownError'));
      setIsGenerating(false);
    }
  };

  const handleSwitchToManual = () => { onSwitchToManual(project); };

  const fetchDebugData = async () => {
    setDebugLoading(true);
    try {
      const response = await supabase.functions.invoke('debug-render-status', { body: { progressId: progressIdRef.current } });
      setDebugData(response.data);
    } catch (e) { setDebugData({ error: e instanceof Error ? e.message : 'Fetch failed' }); }
    finally { setDebugLoading(false); }
  };

  const handleManualRetry = () => {
    renderOnlyRetryCountRef.current = 0;
    totalRetryCountRef.current = 0;
    retryTriggeredRef.current = false;
    invokeInFlightRef.current = false;
    invokedRenderIdRef.current = null;
    setRetryInfo({ renderOnlyAttempts: 0, totalAttempts: 0 });
    setCapacityCooldown(false);
    setError(null);
    if (onRetry) onRetry(); else startAutoGeneration();
  };

  const currentStep = STEPS[currentStepIndex] || STEPS[STEPS.length - 1];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F5C76A]/10 border border-[#F5C76A]/30 mb-4">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F5C76A] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F5C76A]" />
          </span>
          <span className="text-sm font-medium text-[#F5C76A]">{t('uvc.genCategoryCreating', { name: categoryName })}</span>
        </motion.div>
        
        <h2 className="text-3xl font-bold mb-2">
          <span className="bg-gradient-to-r from-[#F5C76A] via-amber-300 to-[#F5C76A] bg-clip-text text-transparent">
            {t('uvc.genVideoCreating')}
          </span>
        </h2>
        <p className="text-muted-foreground">{t('uvc.genSitBack')}</p>
      </motion.div>

      {/* Progress Bar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 p-4 bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl">
        <div className="flex justify-between text-sm mb-3">
          <span className="text-muted-foreground flex items-center gap-2">
            <Crown className="h-4 w-4 text-[#F5C76A]" />
            {statusMessage}
          </span>
          <span className="text-[#F5C76A] font-bold">{Math.round(progress)}%</span>
        </div>
        <div className="h-3 bg-muted/20 rounded-full overflow-hidden border border-white/5">
          <motion.div className="h-full bg-gradient-to-r from-[#F5C76A] via-amber-400 to-[#F5C76A] relative" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5, ease: 'easeOut' }}>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" style={{ backgroundSize: '200% 100%' }} />
          </motion.div>
        </div>
        {(retryInfo.renderOnlyAttempts > 0 || retryInfo.totalAttempts > 0) && (
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span>{t('uvc.genRenderRetries', { count: String(retryInfo.renderOnlyAttempts) })}</span>
            <span>{t('uvc.genTotalAttempts', { count: String(retryInfo.totalAttempts) })}</span>
          </div>
        )}
      </motion.div>

      {/* Steps Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = index === currentStepIndex && isGenerating;
          const isPending = index > currentStepIndex;
          return (
            <motion.div key={step.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.1 }}
              className={cn("relative p-4 rounded-xl border backdrop-blur-sm transition-all duration-300",
                isCompleted && "bg-[#F5C76A]/10 border-[#F5C76A]/30 shadow-[0_0_15px_rgba(245,199,106,0.1)]",
                isCurrent && "bg-[#F5C76A]/20 border-[#F5C76A]/50 shadow-[0_0_25px_rgba(245,199,106,0.2)]",
                isPending && "bg-muted/10 border-white/5 opacity-50"
              )}>
              <div className="flex items-center gap-3 mb-2">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                  isCompleted && "bg-[#F5C76A] text-black",
                  isCurrent && "bg-[#F5C76A]/30 border border-[#F5C76A]/50",
                  isPending && "bg-muted/20 border border-white/10"
                )}>
                  {isCompleted ? <Check className="h-4 w-4" /> : isCurrent ? <Loader2 className="h-4 w-4 animate-spin text-[#F5C76A]" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
                </div>
                <span className={cn("text-sm font-medium", (isCompleted || isCurrent) && "text-[#F5C76A]")}>{step.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Current Step Detail */}
      <motion.div key={currentStepIndex} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#F5C76A]/5 via-transparent to-cyan-500/5 pointer-events-none" />
        <div className="flex items-center gap-4 relative">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F5C76A]/20 to-amber-500/10 flex items-center justify-center border border-[#F5C76A]/30">
            {isGenerating ? <Loader2 className="h-6 w-6 text-[#F5C76A] animate-spin" /> : <Sparkles className="h-6 w-6 text-[#F5C76A]" />}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#F5C76A]">{currentStep.label}</h3>
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          </div>
        </div>
        {Object.keys(generatedAssets).length > 0 && (
          <div className="mt-6 grid grid-cols-5 gap-2">
            <AnimatePresence>
              {Object.entries(generatedAssets).map(([key, url], index) => (
                <motion.div key={key} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.1 }}
                  className="aspect-video rounded-lg overflow-hidden border border-[#F5C76A]/30 shadow-[0_0_10px_rgba(245,199,106,0.1)]">
                  <img src={url} alt={key} className="w-full h-full object-cover" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Capacity Cooldown State */}
      {capacityCooldown && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
              <Shield className="h-6 w-6 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-400 mb-1">{t('uvc.genCapacityTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('uvc.genCapacityDesc')}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-amber-400/70">
                <Clock className="h-3 w-3" />
                <span>{t('uvc.genCapacityWait', { minutes: String(cooldownMinutes) })}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={handleManualRetry} className="border-amber-500/30 hover:bg-amber-500/10 text-amber-400">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('uvc.genManualRetry')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSwitchToManual} className="text-muted-foreground hover:text-foreground">
              <Hand className="h-4 w-4 mr-2" />
              {t('uvc.genManualMode')}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Error State */}
      {error && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="font-medium text-destructive">{t('uvc.genErrorTitle')}</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleManualRetry} className="border-destructive/30 hover:bg-destructive/10">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('uvc.retryBtn')}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Debug Panel */}
      {(isGenerating || error || capacityCooldown) && progressIdRef.current && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }} className="mb-6">
          <button
            onClick={() => { setDebugOpen(!debugOpen); if (!debugOpen && !debugData) fetchDebugData(); }}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Bug className="h-3 w-3" />
            <span>{t('uvc.genDiagnosis')}</span>
            {debugOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {debugOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              className="mt-2 p-4 bg-card/60 border border-border rounded-xl text-xs font-mono overflow-auto max-h-80">
              <div className="flex justify-between items-center mb-3">
                <span className="text-muted-foreground">Progress-ID: {progressIdRef.current}</span>
                <Button variant="ghost" size="sm" onClick={fetchDebugData} disabled={debugLoading} className="h-6 px-2 text-xs">
                  {debugLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              </div>

              <div className="mb-2 p-2 bg-muted/20 rounded">
                <div>Render-Only Retries: <span className="text-[#F5C76A]">{retryInfo.renderOnlyAttempts}/3</span></div>
                <div>Total Attempts: <span className="text-[#F5C76A]">{retryInfo.totalAttempts}/5</span></div>
                <div>Cooldown: <span className={capacityCooldown ? "text-amber-400" : "text-green-500"}>{capacityCooldown ? `Active (${cooldownMinutes}min)` : 'Inactive'}</span></div>
              </div>

              {debugData?.progress?.result_data && (() => {
                const rd = debugData.progress.result_data as any;
                const hasForensics = rd?.isolationStep || rd?.effectiveFlags || rd?.sourceErrorCategory || rd?.failureStage;
                if (!hasForensics) return null;
                return (
                  <div className="mb-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded">
                    <div className="text-blue-400 font-bold mb-1">🔬 r42 Isolation Mode</div>
                    {rd.isolationStep && <div>Isolation Step: <span className="text-blue-300 font-bold">{rd.isolationStep}</span></div>}
                    {rd.sourceErrorCategory && <div>Source Error: <span className="text-amber-400">{rd.sourceErrorCategory}</span></div>}
                    {rd.sourceErrorSignature && <div>Error Signature: <span className="text-muted-foreground">{rd.sourceErrorSignature}</span></div>}
                    {rd.failureStage && <div>Failure Stage: <span className="text-destructive">{rd.failureStage}</span></div>}
                    {rd.errorFingerprint && <div>Fingerprint: <span className="text-muted-foreground">{rd.errorFingerprint}</span></div>}
                    {rd.fpsUsed && <div>FPS: <span className="text-foreground">{rd.fpsUsed}</span></div>}
                    {rd.framesPerLambda && <div>FPL: <span className="text-foreground">{rd.framesPerLambda}</span> ({rd.estimatedLambdas}λ)</div>}
                    {rd.estRuntimeSec != null && <div>Est. Runtime: <span className={rd.timeoutBudgetOk ? "text-green-500" : "text-destructive"}>{rd.estRuntimeSec.toFixed(0)}s</span> {rd.timeoutBudgetOk ? '✅' : '❌ OVER BUDGET'}</div>}
                    {rd.effectiveFlags && (
                      <div className="mt-1">
                        <span className="text-muted-foreground">Flags: </span>
                        <span className="text-foreground">{Object.entries(rd.effectiveFlags).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none'}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {debugData ? (
                <div className="space-y-2">
                  {debugData.diagnosis && (
                    <div className="space-y-1">
                      {(debugData.diagnosis as string[]).map((d: string, i: number) => (
                        <div key={i} className={cn("py-0.5",
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
                          <div>Real Render ID: <span className={((debugData.render.content_config as any)?.real_remotion_render_id) ? "text-green-500" : "text-yellow-500"}>{(debugData.render.content_config as any)?.real_remotion_render_id || 'pending'}</span></div>
                          <div>Lambda Fn: <span className="text-foreground">{(debugData.render.content_config as any)?.lambda_function || '—'}</span></div>
                          <div>OutName: <span className="text-foreground">{(debugData.render.content_config as any)?.out_name || '—'}</span></div>
                        </>
                      )}
                      {debugData.render.error_message && <div className="text-destructive">Error: {debugData.render.error_message}</div>}
                      <div>Diag Profile: <span className="text-[#F5C76A] font-bold">{(debugData.render.content_config as any)?.diagnosticProfile || diagnosticProfile || '—'}</span></div>
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
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                </div>
              ) : null}
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Minimize / Switch to Manual */}
      {isGenerating && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="text-center flex flex-col items-center gap-2">
          {onMinimize && (
            <Button variant="outline" size="sm" onClick={onMinimize} className="border-[#F5C76A]/30 hover:bg-[#F5C76A]/10 text-[#F5C76A]">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('uvc.minimizeMsg').substring(0, 40)}...
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleSwitchToManual} className="text-muted-foreground hover:text-foreground">
            <Hand className="h-4 w-4 mr-2" />
            {t('uvc.genManualMode')}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
