import { tx } from "@/lib/i18nText";
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface QualityPreset {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  is_global: boolean;
  config: {
    resolution: string;
    bitrate: number;
    fps: number;
    quality: string;
    codec?: string;
    compression?: string;
  };
  target_file_size_mb?: number;
  estimated_quality_score?: number;
}

export const useQualityPresets = () => {
  const [presets, setPresets] = useState<QualityPreset[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPresets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('video_quality_presets')
        .select('*')
        .order('is_global', { ascending: false })
        .order('estimated_quality_score', { ascending: false });

      if (error) throw error;

      setPresets(data as unknown as QualityPreset[]);
    } catch (error) {
      console.error('Error fetching quality presets:', error);
      toast.error(tx({ de: 'Fehler beim Laden der Quality Presets', en: 'Error loading quality presets', es: 'Error al cargar los preajustes de calidad' }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPresets();
  }, []);

  const createPreset = async (preset: {
    name: string;
    description?: string;
    config: any;
    target_file_size_mb?: number;
    estimated_quality_score?: number;
  }) => {
    try {
      const { data, error } = await supabase
        .from('video_quality_presets')
        .insert({
          ...preset,
          is_global: false,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(tx({ de: 'Preset erstellt!', en: 'Preset created!', es: '¡Ajuste preestablecido creado!' }));
      await fetchPresets();
      return data;
    } catch (error: any) {
      console.error('Error creating preset:', error);
      toast.error(error.message || tx({ de: 'Fehler beim Erstellen des Presets', en: 'Error creating preset', es: 'Error al crear el preajuste' }));
      return null;
    }
  };

  const updatePreset = async (id: string, updates: Partial<QualityPreset>) => {
    try {
      const { error } = await supabase
        .from('video_quality_presets')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast.success(tx({ de: 'Preset aktualisiert!', en: 'Preset updated!', es: '¡Ajuste preestablecido actualizado!' }));
      await fetchPresets();
      return true;
    } catch (error: any) {
      console.error('Error updating preset:', error);
      toast.error(error.message || tx({ de: 'Fehler beim Aktualisieren des Presets', en: 'Error updating preset', es: 'Error al actualizar el preajuste' }));
      return false;
    }
  };

  const deletePreset = async (id: string) => {
    try {
      const { error } = await supabase
        .from('video_quality_presets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success(tx({ de: 'Preset gelöscht!', en: 'Preset deleted!', es: '¡Ajuste preestablecido eliminado!' }));
      await fetchPresets();
      return true;
    } catch (error: any) {
      console.error('Error deleting preset:', error);
      toast.error(error.message || tx({ de: 'Fehler beim Löschen des Presets', en: 'Error deleting preset', es: 'Error al eliminar el preajuste' }));
      return false;
    }
  };

  return {
    presets,
    loading,
    fetchPresets,
    createPreset,
    updatePreset,
    deletePreset,
  };
};
