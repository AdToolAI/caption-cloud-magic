import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
import { fetchWithTimeout, isTimeoutError } from "../_shared/timeout.ts";
import { tl, withLang } from "../_shared/i18n.ts";
import {
  buildPictureRequest,
  blockingNotice,
} from "../_shared/picturePromptBuilder.ts";
import { readImageDimensions } from "../_shared/imageDimensions.ts";
import { SOURCE_FORMAT } from "../_shared/pictureFormatResolution.ts";
import { persistStudioImage } from "../_shared/studio-image-persist.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-qa-mock',
};

/** Try a single model with retries */
async function tryGenerate(
  model: string,
  messages: any[],
  apiKey: string,
  maxRetries = 3
): Promise<Response | null> {
  let response: Response | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      response = await fetchWithTimeout(
        'https://ai.gateway.lovable.dev/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, messages, modalities: ['image', 'text'] }),
        },
        90_000,
        `ai-gateway ${model}`,
      );
    } catch (e) {
      if (isTimeoutError(e)) {
        console.log(`[Studio] Timeout on ${model} attempt ${attempt}/${maxRetries}`);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return null;
      }
      throw e;
    }

    if (response.ok) return response;

    // Non-retryable client errors
    if (response.status === 401 || response.status === 402 || response.status === 400) {
      return response;
    }

    // Retry on 429 / 5xx
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[Studio] Retry ${attempt}/${maxRetries} for ${model} after ${delay}ms (status ${response.status})`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    break;
  }
  return response;
}

/** Get fallback chain based on quality */
function getFallbackChain(quality: string): string[] {
  if (quality === 'pro') {
    return [
      'google/gemini-3-pro-image-preview',
      'google/gemini-2.5-flash-image',
      'google/gemini-3.1-flash-image-preview',
    ];
  }
  return [
    'google/gemini-2.5-flash-image',
    'google/gemini-3.1-flash-image-preview',
    'google/gemini-3-pro-image-preview',
  ];
}

serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders }
);
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { url: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", imageUrl: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", output: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", predictionId: "qa-mock-image", status: "succeeded" });


  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, code: 401, step: 'auth', error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ ok: false, code: 401, step: 'auth', error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const {
      prompt,
      style = 'realistic',
      aspectRatio = '1:1',
      requestedFormat,
      sourceDimensions,
      quality = 'fast',
      referenceImageUrl,
      referenceImageUrls,
      styleReferenceUrl,
      styleReferenceUrls,
      editMode = false,
      textFree = false,
      mode = 'create',
      strength,
      transparentBackground = false,
      brandKit = null,
    } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ ok: false, code: 400, step: 'validation', error: 'Prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!['create', 'transform', 'restyle', 'mix'].includes(mode)) {
      return new Response(JSON.stringify({ ok: false, code: 'MODE_NOT_SUPPORTED', step: 'validation', error: 'Unsupported image mode' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ ok: false, code: 500, step: 'config', error: 'LOVABLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Deterministic prompt assembly (shared with the Picture Studio UI) --
    // The caller's TEXT-FREE MANDATE block (used by other studios) must stay
    // the last paragraph, so it is split off before the builder runs.
    const textFreeIdx = textFree ? prompt.indexOf('TEXT-FREE MANDATE') : -1;
    const userHead = textFreeIdx > 0 ? prompt.slice(0, textFreeIdx).trim() : String(prompt).trim();
    const textFreeTail = textFreeIdx > 0 ? prompt.slice(textFreeIdx).trim() : '';

    const subjectRefsIn = [
      ...(Array.isArray(referenceImageUrls) ? referenceImageUrls : []),
      ...(referenceImageUrl ? [referenceImageUrl] : []),
    ].filter(Boolean);
    const styleRefsIn = [
      ...(Array.isArray(styleReferenceUrls) ? styleReferenceUrls : []),
      ...(styleReferenceUrl ? [styleReferenceUrl] : []),
    ].filter(Boolean);

    // Format: the stored asset decides the source size, not the browser.
    const effectiveRequestedFormat: string = requestedFormat ?? aspectRatio;
    let serverSource: { width: number; height: number } | null = null;
    if (effectiveRequestedFormat === SOURCE_FORMAT && subjectRefsIn.length) {
      serverSource = await readImageDimensions(subjectRefsIn[0]);
      if (serverSource && sourceDimensions?.width && sourceDimensions?.height) {
        const drift = Math.abs(
          sourceDimensions.width / sourceDimensions.height - serverSource.width / serverSource.height,
        );
        if (drift > 0.01) {
          console.warn('[generate-studio-image] client source ratio differs from stored asset — using asset');
        }
      }
    }

    const built = buildPictureRequest({
      tier: 'standard',
      mode,
      prompt: userHead,
      style,
      requestedFormat: effectiveRequestedFormat,
      source: serverSource,
      subjectRefs: subjectRefsIn,
      styleRefs: styleRefsIn,
      strength: typeof strength === 'number' ? strength : undefined,
      transparentBackground,
      brandKit,
    });

    const blocker = blockingNotice(built);
    if (blocker) {
      return new Response(JSON.stringify({ ok: false, code: blocker.code, step: 'validation', error: tl(blocker.message) }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const enhancedPrompt = textFreeTail
      ? `${built.prompt}\n\n${textFreeTail}\nDo not render any text of any kind.`.trim()
      : built.prompt;

    // Build messages — Gemini chat shape accepts multiple reference images
    // (capability matrix: 3 subject + 1 style, see _shared/pictureModelCapabilities.ts).
    const refUrls: string[] = mode === 'create' ? [] : [...subjectRefsIn, ...styleRefsIn];
    if (refUrls.length > 4) {
      return new Response(JSON.stringify({ ok: false, code: 'REFERENCE_LIMIT_EXCEEDED', step: 'validation', error: 'Gemini accepts at most 4 reference images' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const messages: any[] = [];
    if (refUrls.length) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: enhancedPrompt },
          ...refUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
        ]
      });
    } else {
      messages.push({ role: 'user', content: enhancedPrompt });
    }

    // Model fallback chain
    const fallbackChain = getFallbackChain(quality);
    let response: Response | null = null;
    let usedModel = '';
    const attemptedModels: string[] = [];

    for (const candidateModel of fallbackChain) {
      attemptedModels.push(candidateModel);
      console.log(`[Studio] Trying model: ${candidateModel}`);
      
      response = await tryGenerate(candidateModel, messages, LOVABLE_API_KEY);
      usedModel = candidateModel;

      if (response?.ok) {
        console.log(`[Studio] Success with model: ${candidateModel}`);
        break;
      }

      // Non-retryable errors: stop immediately
      if (response?.status === 401 || response?.status === 402 || response?.status === 400) {
        break;
      }

      console.log(`[Studio] Model ${candidateModel} failed (${response?.status}), trying next...`);
    }

    if (!response || !response.ok) {
      const status = response?.status || 500;
      let errorText = '';
      try { errorText = await response!.text(); } catch {}
      console.error('[Studio] All models failed:', status, errorText);

      if (status === 429) {
        return new Response(JSON.stringify({ 
          ok: false, code: 429, step: 'ai_generate', 
          error: tl({ de: 'Alle Modelle sind gerade überlastet. Bitte versuche es in 1-2 Minuten erneut.', en: 'All models are currently overloaded. Please try again in 1-2 minutes.', es: 'Todos los modelos están actualmente sobrecargados. Por favor, inténtalo de nuevo en 1-2 minutos.' }),
          attemptedModels 
        }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ 
          ok: false, code: 402, step: 'ai_generate', 
          error: tl({ de: 'Credits erschöpft. Bitte lade dein Guthaben auf.', en: 'Credits exhausted. Please top up your balance.', es: 'Créditos agotados. Por favor, recarga tu saldo.' }),
          attemptedModels 
        }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ 
        ok: false, code: status, step: 'ai_generate', 
        error: `KI-Generierung fehlgeschlagen (${status})`,
        attemptedModels 
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const aiData = await response.json();
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      return new Response(JSON.stringify({ 
        ok: false, code: 500, step: 'parse_result', 
        error: 'Kein Bild generiert. Bitte versuche einen anderen Prompt.',
        attemptedModels 
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Detect MIME type
    const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';

    const blobResponse = await fetch(imageData);
    const blob = await blobResponse.blob();
    const fileName = `${user.id}/studio/${Date.now()}_${style}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('background-projects')
      .upload(fileName, blob, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error('[Studio] Upload error:', uploadError);
      return new Response(JSON.stringify({ 
        ok: false, code: 500, step: 'storage_upload', 
        error: tl({ de: 'Bild konnte nicht gespeichert werden.', en: 'Could not save image.', es: 'No se pudo guardar la imagen.' }) 
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: publicUrlData } = supabase.storage
      .from('background-projects')
      .getPublicUrl(fileName);
    const imageUrl = publicUrlData.publicUrl;

    // Find or create the "KI Picture Studio" system album for auto-assignment
    let albumId: string | null = null;
    const { data: systemAlbum } = await supabase
      .from('studio_albums')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_system', true)
      .eq('name', 'KI Picture Studio')
      .maybeSingle();

    if (systemAlbum) {
      albumId = systemAlbum.id;
    } else {
      const { data: newAlbum } = await supabase
        .from('studio_albums')
        .insert({ user_id: user.id, name: 'KI Picture Studio', is_system: true })
        .select('id')
        .single();
      albumId = newAlbum?.id || null;
    }

    const persisted = await persistStudioImage(
      supabase,
      {
        user_id: user.id,
        image_url: imageUrl,
        workflow_type: editMode ? 'edited' : 'generated',
        prompt,
        style,
        model_used: usedModel,
        aspect_ratio: built.resolvedFormat.aspectRatio,
        source: editMode ? 'upload' : 'generated',
        album_id: albumId,
        metadata_json: { quality, editMode, requestedFormat: built.requestedFormat, resolvedFormat: built.resolvedFormat, referenceImageUrl: editMode ? referenceImageUrl : null, attemptedModels },
      },
      '[Studio]',
    );
    const savedImage = persisted.id ? { id: persisted.id } : null;

    if (!persisted.ok) {
      console.error('[Studio] Save error:', persisted.error);
    }

    return new Response(JSON.stringify({
      success: true,
      image: {
        id: savedImage?.id,
        url: imageUrl,
        previewUrl: imageData,
        prompt,
        style,
        aspectRatio: built.resolvedFormat.aspectRatio,
        requestedFormat: built.requestedFormat,
        resolvedFormat: built.resolvedFormat,
        model: usedModel,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[Studio] Error:', error);
    return new Response(JSON.stringify({ 
      ok: false, code: 500, step: 'unknown', 
      error: error.message || 'Interner Serverfehler' 
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})(req)));
