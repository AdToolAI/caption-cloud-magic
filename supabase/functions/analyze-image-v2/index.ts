import { createClient } from 'npm:@supabase/supabase-js@2';
import { withTelemetry } from '../_shared/telemetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageAnalysisRequest {
  imageUrl: string;
  brandKitId?: string;
}

interface ImageAnalysisResponse {
  quality: {
    resolution: { width: number; height: number };
    aspectRatio: string;
    fileSize: number;
    qualityScore: number;
    issues: string[];
  };
  crops: {
    square: string;      // 1:1
    portrait: string;    // 4:5
    story: string;       // 9:16
  };
  ciMatch?: {
    primaryColorMatch: number;
    secondaryColorMatch: number;
    overallMatch: number;
  };
}

Deno.serve(withTelemetry('analyze-image-v2', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { imageUrl, brandKitId }: ImageAnalysisRequest = await req.json();

    console.log('Starting image analysis for:', imageUrl);

    // Download image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image');
    }
    
    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // Analyze image using Canvas API (server-side)
    const analysis = await analyzeImage(imageBuffer);

    // Generate crops
    const crops = await generateCrops(imageUrl, supabase, user.id);

    // CI color matching if brand kit provided
    let ciMatch;
    if (brandKitId) {
      ciMatch = await analyzeCIMatch(imageBuffer, brandKitId, supabase);
    }

    const result: ImageAnalysisResponse = {
      quality: analysis,
      crops,
      ...(ciMatch && { ciMatch }),
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-image-v2:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));

async function analyzeImage(imageBuffer: ArrayBuffer) {
  // Basic image analysis using Image metadata
  const uint8Array = new Uint8Array(imageBuffer);
  
  // Simple heuristics for quality assessment
  const fileSize = imageBuffer.byteLength;
  const estimatedWidth = 1920; // Placeholder - would need actual image decoding
  const estimatedHeight = 1080;
  
  const qualityScore = calculateQualityScore(fileSize, estimatedWidth, estimatedHeight);
  const issues: string[] = [];
  
  if (fileSize < 200000) issues.push('Niedrige Dateigröße - könnte pixelig wirken');
  if (estimatedWidth < 1080) issues.push('Auflösung unter Empfehlung (1080px)');
  
  return {
    resolution: { width: estimatedWidth, height: estimatedHeight },
    aspectRatio: `${estimatedWidth}:${estimatedHeight}`,
    fileSize,
    qualityScore,
    issues,
  };
}

function calculateQualityScore(fileSize: number, width: number, height: number): number {
  let score = 100;
  
  if (fileSize < 200000) score -= 20;
  if (width < 1080) score -= 30;
  if (height < 1080) score -= 20;
  
  return Math.max(0, score);
}

async function generateCrops(imageUrl: string, supabase: any, userId: string) {
  // For now, return the original image URL for all crops
  // In production, you'd implement server-side image processing
  // using a library like Sharp or ImageMagick
  
  console.log('Generating crops for:', imageUrl);
  
  // Placeholder: Return original URL for all crops
  // TODO: Implement actual cropping logic with Sharp
  return {
    square: imageUrl,
    portrait: imageUrl,
    story: imageUrl,
  };
}

async function analyzeCIMatch(imageBuffer: ArrayBuffer, brandKitId: string, supabase: any) {
  // Fetch brand kit colors
  const { data: brandKit } = await supabase
    .from('brand_kits')
    .select('primary_color, secondary_color')
    .eq('id', brandKitId)
    .single();

  if (!brandKit) return null;

  // Simplified color matching
  // In production, you'd analyze image histogram and compare with brand colors
  
  console.log('Analyzing CI match with brand colors:', brandKit);
  
  // Placeholder scores
  return {
    primaryColorMatch: 75,
    secondaryColorMatch: 60,
    overallMatch: 68,
  };
}
