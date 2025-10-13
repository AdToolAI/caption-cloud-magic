import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js to always download models
env.allowLocalModels = false;
env.useBrowserCache = false;

const MAX_IMAGE_DIMENSION = 1024;

function resizeImageIfNeeded(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, image: HTMLImageElement) {
  let width = image.naturalWidth;
  let height = image.naturalHeight;

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
      width = MAX_IMAGE_DIMENSION;
    } else {
      width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
      height = MAX_IMAGE_DIMENSION;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);
    return true;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0);
  return false;
}

// Enhanced edge refinement with feathering
function refineEdges(imageData: ImageData, featherRadius: number = 2): ImageData {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const refined = new ImageData(width, height);
  
  // Copy original data
  refined.data.set(data);
  
  // Apply feathering to alpha channel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      
      // Skip fully transparent or opaque pixels
      if (alpha === 0 || alpha === 255) continue;
      
      // Calculate average alpha in neighborhood
      let sum = 0;
      let count = 0;
      
      for (let dy = -featherRadius; dy <= featherRadius; dy++) {
        for (let dx = -featherRadius; dx <= featherRadius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const nidx = (ny * width + nx) * 4;
            sum += data[nidx + 3];
            count++;
          }
        }
      }
      
      // Apply smooth feathering
      refined.data[idx + 3] = Math.round(sum / count);
    }
  }
  
  return refined;
}

export const removeBackground = async (imageElement: HTMLImageElement, quality: 'fast' | 'high' = 'high'): Promise<{ cutoutBlob: Blob; edgeScore: number }> => {
  try {
    console.log('Starting enhanced background removal...');
    const segmenter = await pipeline('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', {
      device: 'webgpu',
    });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('Could not get canvas context');
    
    const wasResized = resizeImageIfNeeded(canvas, ctx, imageElement);
    console.log(`Image ${wasResized ? 'was' : 'was not'} resized. Final dimensions: ${canvas.width}x${canvas.height}`);
    
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    console.log('Processing with segmentation model...');
    const result = await segmenter(imageData);
    
    if (!result || !Array.isArray(result) || result.length === 0 || !result[0].mask) {
      throw new Error('Invalid segmentation result');
    }
    
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = canvas.width;
    outputCanvas.height = canvas.height;
    const outputCtx = outputCanvas.getContext('2d');
    
    if (!outputCtx) throw new Error('Could not get output canvas context');
    
    outputCtx.drawImage(canvas, 0, 0);
    
    let outputImageData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
    const data = outputImageData.data;
    
    // Apply inverted mask to alpha channel
    for (let i = 0; i < result[0].mask.data.length; i++) {
      const alpha = Math.round((1 - result[0].mask.data[i]) * 255);
      data[i * 4 + 3] = alpha;
    }
    
    // Apply edge refinement if high quality
    if (quality === 'high') {
      console.log('Applying edge refinement...');
      outputImageData = refineEdges(outputImageData, 2);
    }
    
    outputCtx.putImageData(outputImageData, 0, 0);
    
    // Calculate edge quality score
    let edgeTransitions = 0;
    let smoothEdges = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 0 && alpha < 255) {
        edgeTransitions++;
        if (alpha > 50 && alpha < 205) smoothEdges++;
      }
    }
    const edgeScore = Math.min(100, Math.round((smoothEdges / Math.max(1, edgeTransitions)) * 100));
    
    console.log(`Edge quality score: ${edgeScore}/100`);
    
    const cutoutBlob = await new Promise<Blob>((resolve, reject) => {
      outputCanvas.toBlob(
        (blob) => {
          if (blob) {
            console.log('Successfully created final blob');
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/png',
        1.0
      );
    });
    
    return { cutoutBlob, edgeScore };
  } catch (error) {
    console.error('Error removing background:', error);
    throw error;
  }
};

export const loadImage = (file: Blob): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};
