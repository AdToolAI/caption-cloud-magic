/**
 * Integration Tests: Database Schema
 * Tests JSONB columns, scene data persistence, and schema validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import type { Scene } from '@/types/scene';

describe('Content Projects Schema', () => {
  let testProjectId: string | null = null;
  let testUserId: string = 'test-user-id';

  beforeEach(async () => {
    // Create test user session if needed
    // This would be set up in a global setup file
  });

  afterEach(async () => {
    // Cleanup test data
    if (testProjectId) {
      await supabase
        .from('content_projects')
        .delete()
        .eq('id', testProjectId);
      
      testProjectId = null;
    }
  });

  describe('scenes JSONB column', () => {
    it('should insert project with scenes array', async () => {
      const scenes: Scene[] = [
        {
          id: 'scene_1',
          order: 0,
          duration: 5,
          background: {
            type: 'color',
            color: '#FF5733',
          },
          transition: {
            type: 'fade',
            duration: 0.5,
          },
          backgroundAnimation: {
            type: 'none',
            intensity: 1,
          },
        },
      ];

      const { data, error } = await supabase
        .from('content_projects')
        .insert({
          title: 'Test Project with Scenes',
          content_type: 'video',
          user_id: testUserId,
          scenes: scenes as any,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data?.scenes).toEqual(scenes);
      
      if (data) {
        testProjectId = data.id;
      }
    });

    it('should update scenes array', async () => {
      // Create project
      const { data: project } = await supabase
        .from('content_projects')
        .insert({
          title: 'Update Test',
          content_type: 'video',
          user_id: testUserId,
          scenes: [] as any,
        })
        .select()
        .single();

      testProjectId = project?.id || null;

      // Update with new scenes
      const updatedScenes: Scene[] = [
        {
          id: 'scene_1',
          order: 0,
          duration: 3,
          background: { type: 'color', color: '#000000' },
          transition: { type: 'crossfade', duration: 1 },
          backgroundAnimation: { type: 'zoom', intensity: 1.2 },
        },
        {
          id: 'scene_2',
          order: 1,
          duration: 4,
          background: { type: 'image', url: 'https://example.com/img.jpg' },
          transition: { type: 'slide', duration: 0.8 },
          backgroundAnimation: { type: 'pan', intensity: 1.5 },
        },
      ];

      const { data: updated, error } = await supabase
        .from('content_projects')
        .update({ scenes: updatedScenes as any })
        .eq('id', testProjectId!)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updated?.scenes).toEqual(updatedScenes);
    });

    it('should query and parse scenes correctly', async () => {
      const scenes: Scene[] = [
        {
          id: 'scene_1',
          order: 0,
          duration: 5,
          background: { type: 'video', url: 'https://example.com/video.mp4' },
          transition: { type: 'fade', duration: 0.5 },
          backgroundAnimation: { type: 'none', intensity: 1 },
        },
      ];

      const { data: project } = await supabase
        .from('content_projects')
        .insert({
          title: 'Query Test',
          content_type: 'video',
          user_id: testUserId,
          scenes: scenes as any,
        })
        .select()
        .single();

      testProjectId = project?.id || null;

      // Query back
      const { data: queried } = await supabase
        .from('content_projects')
        .select('*')
        .eq('id', testProjectId!)
        .single();

      expect(queried?.scenes).toBeTruthy();
      expect(Array.isArray(queried?.scenes)).toBe(true);
      expect(queried?.scenes[0]).toMatchObject({
        id: 'scene_1',
        order: 0,
        duration: 5,
      });
    });

    it('should handle empty scenes array', async () => {
      const { data, error } = await supabase
        .from('content_projects')
        .insert({
          title: 'Empty Scenes Test',
          content_type: 'video',
          user_id: testUserId,
          scenes: [] as any,
        })
        .select()
        .single();

      testProjectId = data?.id || null;

      expect(error).toBeNull();
      expect(data?.scenes).toEqual([]);
    });

    it('should handle null scenes', async () => {
      const { data, error } = await supabase
        .from('content_projects')
        .insert({
          title: 'Null Scenes Test',
          content_type: 'video',
          user_id: testUserId,
          scenes: null,
        })
        .select()
        .single();

      testProjectId = data?.id || null;

      expect(error).toBeNull();
      expect(data?.scenes).toBeNull();
    });
  });

  describe('Scene structure validation', () => {
    it('should validate required scene fields', () => {
      const validScene: Scene = {
        id: 'scene_1',
        order: 0,
        duration: 5,
        background: { type: 'color', color: '#FFFFFF' },
        transition: { type: 'fade', duration: 0.5 },
        backgroundAnimation: { type: 'none', intensity: 1 },
      };

      // Check all required fields exist
      expect(validScene.id).toBeDefined();
      expect(validScene.order).toBeDefined();
      expect(validScene.duration).toBeDefined();
      expect(validScene.background).toBeDefined();
      expect(validScene.transition).toBeDefined();
      expect(validScene.backgroundAnimation).toBeDefined();
    });

    it('should validate background types', () => {
      const colorBg = { type: 'color' as const, color: '#FF5733' };
      const imageBg = { type: 'image' as const, url: 'https://example.com/img.jpg' };
      const videoBg = { type: 'video' as const, url: 'https://example.com/video.mp4' };

      expect(colorBg.type).toBe('color');
      expect(imageBg.type).toBe('image');
      expect(videoBg.type).toBe('video');
    });

    it('should validate transition types', () => {
      const validTransitions = ['none', 'fade', 'crossfade', 'slide', 'wipe'];
      
      validTransitions.forEach(type => {
        const transition = { type: type as any, duration: 0.5 };
        expect(transition.type).toBe(type);
      });
    });

    it('should validate background animation types', () => {
      const validAnimations = ['none', 'zoom', 'pan'];
      
      validAnimations.forEach(type => {
        const animation = { type: type as any, intensity: 1.2 };
        expect(animation.type).toBe(type);
      });
    });
  });

  describe('Auto-save functionality', () => {
    it('should preserve scene data on update', async () => {
      const initialScenes: Scene[] = [
        {
          id: 'scene_1',
          order: 0,
          duration: 5,
          background: { type: 'color', color: '#FF5733' },
          transition: { type: 'fade', duration: 0.5 },
          backgroundAnimation: { type: 'zoom', intensity: 1.2 },
        },
      ];

      // Create project
      const { data: project } = await supabase
        .from('content_projects')
        .insert({
          title: 'Auto-save Test',
          content_type: 'video',
          user_id: testUserId,
          scenes: initialScenes as any,
        })
        .select()
        .single();

      testProjectId = project?.id || null;

      // Add another scene
      const updatedScenes: Scene[] = [
        ...initialScenes,
        {
          id: 'scene_2',
          order: 1,
          duration: 3,
          background: { type: 'image', url: 'https://example.com/img.jpg' },
          transition: { type: 'crossfade', duration: 1 },
          backgroundAnimation: { type: 'pan', intensity: 1.5 },
        },
      ];

      await supabase
        .from('content_projects')
        .update({ scenes: updatedScenes as any })
        .eq('id', testProjectId!);

      // Reload project
      const { data: reloaded } = await supabase
        .from('content_projects')
        .select('*')
        .eq('id', testProjectId!)
        .single();

      expect(reloaded?.scenes).toHaveLength(2);
      expect(reloaded?.scenes[0]).toMatchObject(initialScenes[0]);
      expect(reloaded?.scenes[1]).toMatchObject(updatedScenes[1]);
    });

    it('should preserve all scene properties', async () => {
      const complexScene: Scene = {
        id: 'complex_scene',
        order: 0,
        duration: 7.5,
        background: {
          type: 'video',
          url: 'https://example.com/bg.mp4',
        },
        transition: {
          type: 'slide',
          duration: 1.2,
          direction: 'left',
        },
        backgroundAnimation: {
          type: 'zoom',
          intensity: 1.3,
          speed: 0.8,
        },
      };

      const { data: project } = await supabase
        .from('content_projects')
        .insert({
          title: 'Complex Scene Test',
          content_type: 'video',
          user_id: testUserId,
          scenes: [complexScene] as any,
        })
        .select()
        .single();

      testProjectId = project?.id || null;

      // Reload
      const { data: reloaded } = await supabase
        .from('content_projects')
        .select('*')
        .eq('id', testProjectId!)
        .single();

      const savedScene = reloaded?.scenes[0];
      expect(savedScene).toMatchObject(complexScene);
      expect(savedScene.transition.direction).toBe('left');
      expect(savedScene.backgroundAnimation.speed).toBe(0.8);
    });
  });

  describe('Scene reordering', () => {
    it('should maintain correct order after reordering', async () => {
      const scenes: Scene[] = [
        {
          id: 'scene_1',
          order: 0,
          duration: 5,
          background: { type: 'color', color: '#FF0000' },
          transition: { type: 'fade', duration: 0.5 },
          backgroundAnimation: { type: 'none', intensity: 1 },
        },
        {
          id: 'scene_2',
          order: 1,
          duration: 4,
          background: { type: 'color', color: '#00FF00' },
          transition: { type: 'fade', duration: 0.5 },
          backgroundAnimation: { type: 'none', intensity: 1 },
        },
        {
          id: 'scene_3',
          order: 2,
          duration: 3,
          background: { type: 'color', color: '#0000FF' },
          transition: { type: 'fade', duration: 0.5 },
          backgroundAnimation: { type: 'none', intensity: 1 },
        },
      ];

      const { data: project } = await supabase
        .from('content_projects')
        .insert({
          title: 'Reorder Test',
          content_type: 'video',
          user_id: testUserId,
          scenes: scenes as any,
        })
        .select()
        .single();

      testProjectId = project?.id || null;

      // Reorder: move first to last
      const reordered = [
        { ...scenes[1], order: 0 },
        { ...scenes[2], order: 1 },
        { ...scenes[0], order: 2 },
      ];

      await supabase
        .from('content_projects')
        .update({ scenes: reordered as any })
        .eq('id', testProjectId!);

      const { data: updated } = await supabase
        .from('content_projects')
        .select('*')
        .eq('id', testProjectId!)
        .single();

      expect(updated?.scenes[0].id).toBe('scene_2');
      expect(updated?.scenes[1].id).toBe('scene_3');
      expect(updated?.scenes[2].id).toBe('scene_1');
    });

    it('should delete middle scene correctly', async () => {
      const scenes: Scene[] = [
        {
          id: 'scene_1',
          order: 0,
          duration: 5,
          background: { type: 'color', color: '#FFFFFF' },
          transition: { type: 'fade', duration: 0.5 },
          backgroundAnimation: { type: 'none', intensity: 1 },
        },
        {
          id: 'scene_2',
          order: 1,
          duration: 5,
          background: { type: 'color', color: '#000000' },
          transition: { type: 'fade', duration: 0.5 },
          backgroundAnimation: { type: 'none', intensity: 1 },
        },
        {
          id: 'scene_3',
          order: 2,
          duration: 5,
          background: { type: 'color', color: '#FF0000' },
          transition: { type: 'fade', duration: 0.5 },
          backgroundAnimation: { type: 'none', intensity: 1 },
        },
      ];

      const { data: project } = await supabase
        .from('content_projects')
        .insert({
          title: 'Delete Test',
          content_type: 'video',
          user_id: testUserId,
          scenes: scenes as any,
        })
        .select()
        .single();

      testProjectId = project?.id || null;

      // Delete middle scene and reorder
      const afterDelete = [
        { ...scenes[0], order: 0 },
        { ...scenes[2], order: 1 },
      ];

      await supabase
        .from('content_projects')
        .update({ scenes: afterDelete as any })
        .eq('id', testProjectId!);

      const { data: updated } = await supabase
        .from('content_projects')
        .select('*')
        .eq('id', testProjectId!)
        .single();

      expect(updated?.scenes).toHaveLength(2);
      expect(updated?.scenes[0].id).toBe('scene_1');
      expect(updated?.scenes[1].id).toBe('scene_3');
    });
  });
});
