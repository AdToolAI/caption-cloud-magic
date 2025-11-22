import { useState, useCallback } from 'react';
import type { Scene, SceneBackground, SceneTransition } from '@/types/scene';

export function useSceneManager(initialScenes: Scene[] = []) {
  const [scenes, setScenes] = useState<Scene[]>(initialScenes);

  const addScene = useCallback((background: SceneBackground, duration: number = 5) => {
    const newScene: Scene = {
      id: `scene_${Date.now()}`,
      order: scenes.length,
      duration,
      background,
      transition: {
        type: 'fade',
        duration: 0.5,
      },
      backgroundAnimation: {
        type: 'none',
        intensity: 1.2,
      },
    };
    setScenes((prev) => [...prev, newScene]);
    return newScene;
  }, [scenes.length]);

  const updateScene = useCallback((id: string, updates: Partial<Scene>) => {
    setScenes((prev) =>
      prev.map((scene) => (scene.id === id ? { ...scene, ...updates } : scene))
    );
  }, []);

  const deleteScene = useCallback((id: string) => {
    setScenes((prev) => {
      const filtered = prev.filter((scene) => scene.id !== id);
      // Reorder remaining scenes
      return filtered.map((scene, index) => ({ ...scene, order: index }));
    });
  }, []);

  const reorderScenes = useCallback((oldIndex: number, newIndex: number) => {
    setScenes((prev) => {
      const result = Array.from(prev);
      const [removed] = result.splice(oldIndex, 1);
      result.splice(newIndex, 0, removed);
      // Update order property
      return result.map((scene, index) => ({ ...scene, order: index }));
    });
  }, []);

  const updateTransition = useCallback(
    (id: string, transition: Partial<SceneTransition>) => {
      setScenes((prev) =>
        prev.map((scene) =>
          scene.id === id
            ? { ...scene, transition: { ...scene.transition, ...transition } }
            : scene
        )
      );
    },
    []
  );

  const calculateTotalDuration = useCallback(() => {
    return scenes.reduce((total, scene) => total + scene.duration, 0);
  }, [scenes]);

  return {
    scenes,
    setScenes,
    addScene,
    updateScene,
    deleteScene,
    reorderScenes,
    updateTransition,
    calculateTotalDuration,
  };
}
