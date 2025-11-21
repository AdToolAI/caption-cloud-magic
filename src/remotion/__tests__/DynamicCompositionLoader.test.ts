import { describe, it, expect } from 'vitest';
import { mapFieldsToProps, getCompositionSettings } from '../DynamicCompositionLoader';

describe('DynamicCompositionLoader', () => {
  describe('mapFieldsToProps', () => {
    it('should map basic fields without transformation', () => {
      const customizations = {
        productName: 'Test Product',
        price: '29.99',
      };
      
      const fieldMappings = [
        { field_key: 'productName', remotion_prop_name: 'productName', transformation_function: null },
        { field_key: 'price', remotion_prop_name: 'price', transformation_function: null },
      ];
      
      const result = mapFieldsToProps(customizations, fieldMappings);
      
      expect(result).toEqual({
        productName: 'Test Product',
        price: '29.99',
      });
    });

    it('should apply to_number transformation', () => {
      const customizations = {
        price: '29.99',
        quantity: '5',
      };
      
      const fieldMappings = [
        { field_key: 'price', remotion_prop_name: 'price', transformation_function: 'to_number' },
        { field_key: 'quantity', remotion_prop_name: 'quantity', transformation_function: 'to_number' },
      ];
      
      const result = mapFieldsToProps(customizations, fieldMappings);
      
      expect(result).toEqual({
        price: 29.99,
        quantity: 5,
      });
    });

    it('should apply to_array transformation', () => {
      const customizations = {
        steps: 'Step 1\nStep 2\nStep 3',
        tags: '#tag1, #tag2, #tag3',
      };
      
      const fieldMappings = [
        { field_key: 'steps', remotion_prop_name: 'steps', transformation_function: 'to_array' },
        { field_key: 'tags', remotion_prop_name: 'tags', transformation_function: 'to_array' },
      ];
      
      const result = mapFieldsToProps(customizations, fieldMappings);
      
      expect(result.steps).toEqual(['Step 1', 'Step 2', 'Step 3']);
      expect(result.tags).toEqual(['#tag1', '#tag2', '#tag3']);
    });

    it('should apply color_to_hex transformation', () => {
      const customizations = {
        primaryColor: 'rgb(255, 0, 0)',
        secondaryColor: '#00ff00',
      };
      
      const fieldMappings = [
        { field_key: 'primaryColor', remotion_prop_name: 'primaryColor', transformation_function: 'color_to_hex' },
        { field_key: 'secondaryColor', remotion_prop_name: 'secondaryColor', transformation_function: 'color_to_hex' },
      ];
      
      const result = mapFieldsToProps(customizations, fieldMappings);
      
      expect(result.primaryColor).toBe('#ff0000');
      expect(result.secondaryColor).toBe('#00ff00');
    });

    it('should apply url_encode transformation', () => {
      const customizations = {
        searchQuery: 'hello world & more',
      };
      
      const fieldMappings = [
        { field_key: 'searchQuery', remotion_prop_name: 'searchQuery', transformation_function: 'url_encode' },
      ];
      
      const result = mapFieldsToProps(customizations, fieldMappings);
      
      expect(result.searchQuery).toBe('hello%20world%20%26%20more');
    });

    it('should handle missing field values gracefully', () => {
      const customizations = {
        existingField: 'value',
      };
      
      const fieldMappings = [
        { field_key: 'existingField', remotion_prop_name: 'existingField', transformation_function: null },
        { field_key: 'missingField', remotion_prop_name: 'missingField', transformation_function: null },
      ];
      
      const result = mapFieldsToProps(customizations, fieldMappings);
      
      expect(result).toEqual({
        existingField: 'value',
        missingField: undefined,
      });
    });

    it('should handle complex nested transformations', () => {
      const customizations = {
        steps: '1. First step\n2. Second step\n3. Third step',
        rating: '4.5',
        colors: '#ff0000,#00ff00,#0000ff',
      };
      
      const fieldMappings = [
        { field_key: 'steps', remotion_prop_name: 'steps', transformation_function: 'to_array' },
        { field_key: 'rating', remotion_prop_name: 'rating', transformation_function: 'to_number' },
        { field_key: 'colors', remotion_prop_name: 'colors', transformation_function: 'to_array' },
      ];
      
      const result = mapFieldsToProps(customizations, fieldMappings);
      
      expect(result.steps).toHaveLength(3);
      expect(result.rating).toBe(4.5);
      expect(result.colors).toHaveLength(3);
    });
  });

  describe('getCompositionSettings', () => {
    it('should return default settings for ProductAd', () => {
      const settings = getCompositionSettings('ProductAd');
      
      expect(settings).toMatchObject({
        durationInFrames: expect.any(Number),
        fps: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      });
    });

    it('should return default settings for InstagramStory', () => {
      const settings = getCompositionSettings('InstagramStory');
      
      expect(settings).toMatchObject({
        durationInFrames: expect.any(Number),
        fps: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      });
    });

    it('should return fallback settings for unknown component', () => {
      const settings = getCompositionSettings('UnknownComponent' as any);
      
      expect(settings).toMatchObject({
        durationInFrames: expect.any(Number),
        fps: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      });
    });

    it('should have consistent fps across all components', () => {
      const components = ['ProductAd', 'InstagramStory', 'TikTokReel', 'Testimonial', 'Tutorial'];
      const fps = components.map(comp => getCompositionSettings(comp as any).fps);
      
      // All should have the same fps (usually 30)
      expect(new Set(fps).size).toBe(1);
    });
  });
});
