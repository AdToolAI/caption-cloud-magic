import { useState, useEffect } from 'react';

type RenderEngine = 'remotion' | 'shotstack';

const RENDER_ENGINE_KEY = 'preferred_render_engine';

export const useRenderEngine = () => {
  const [renderEngine, setRenderEngineState] = useState<RenderEngine>(() => {
    const stored = localStorage.getItem(RENDER_ENGINE_KEY);
    return (stored === 'shotstack' ? 'shotstack' : 'remotion') as RenderEngine;
  });

  const setRenderEngine = (engine: RenderEngine) => {
    localStorage.setItem(RENDER_ENGINE_KEY, engine);
    setRenderEngineState(engine);
  };

  return {
    renderEngine,
    setRenderEngine,
  };
};
