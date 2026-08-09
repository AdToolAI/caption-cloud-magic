import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';
import { tx } from "@/lib/i18nText";

export interface CloudConnection {
  id: string;
  provider: string;
  is_active: boolean;
  auto_sync: boolean;
  account_email: string | null;
  account_name: string | null;
  folder_name: string | null;
  quota_bytes: number;
  used_bytes: number;
  created_at: string;
}

export interface CloudFile {
  id: string;
  name: string;
  size: string;
  mimeType: string;
  createdTime: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
}

export const useCloudStorage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [connection, setConnection] = useState<CloudConnection | null>(null);
  const [cloudFiles, setCloudFiles] = useState<CloudFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchConnection = useCallback(async () => {
    if (!user) {
      setConnection(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('cloud_storage_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'google_drive')
        .maybeSingle();

      if (error) throw error;
      setConnection(data as CloudConnection | null);
    } catch (err) {
      console.error('Error fetching cloud connection:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

  const connectGoogleDrive = useCallback(async () => {
    if (!user) return;

    try {
      const redirectUri = `${window.location.origin}/account`;
      
      const { data, error } = await supabase.functions.invoke('cloud-storage-oauth', {
        body: {
          action: 'get_auth_url',
          user_id: user.id,
          redirect_uri: redirectUri,
        }
      });

      if (error) throw error;
      if (data?.auth_url) {
        // Store state for callback
        sessionStorage.setItem('cloud_storage_oauth', JSON.stringify({
          user_id: user.id,
          redirect_uri: redirectUri,
        }));
        window.location.href = data.auth_url;
      }
    } catch (err) {
      console.error('Error starting OAuth:', err);
      toast({
        title: 'Verbindungsfehler',
        description: tx({ de: 'Google Drive konnte nicht verbunden werden.', en: 'Google Drive could not be connected.', es: 'No se pudo conectar Google Drive.' }),
        variant: 'destructive',
      });
    }
  }, [user, toast]);

  const handleOAuthCallback = useCallback(async (code: string) => {
    if (!user) return;

    try {
      setLoading(true);
      const oauthState = sessionStorage.getItem('cloud_storage_oauth');
      const { redirect_uri } = oauthState ? JSON.parse(oauthState) : { redirect_uri: `${window.location.origin}/account` };

      const { data, error } = await supabase.functions.invoke('cloud-storage-oauth', {
        body: {
          action: 'exchange_code',
          code,
          user_id: user.id,
          redirect_uri,
        }
      });

      if (error) throw error;

      sessionStorage.removeItem('cloud_storage_oauth');
      await fetchConnection();

      toast({
        title: '✅ Google Drive verbunden',
        description: `Verbunden als ${data.connection?.account_email}`,
      });

      return data.connection;
    } catch (err) {
      console.error('Error exchanging code:', err);
      toast({
        title: 'Verbindungsfehler',
        description: tx({ de: 'Der OAuth-Code konnte nicht verarbeitet werden.', en: 'The OAuth code could not be processed.', es: 'No se pudo procesar el código OAuth.' }),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast, fetchConnection]);

  const disconnect = useCallback(async () => {
    if (!user) return;

    try {
      const { error } = await supabase.functions.invoke('cloud-storage-oauth', {
        body: { action: 'disconnect', user_id: user.id }
      });

      if (error) throw error;

      setConnection(null);
      setCloudFiles([]);

      toast({
        title: 'Google Drive getrennt',
        description: tx({ de: 'Die Verbindung wurde entfernt.', en: 'The connection has been removed.', es: 'La conexión ha sido eliminada.' }),
      });
    } catch (err) {
      console.error('Error disconnecting:', err);
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: tx({ de: 'Verbindung konnte nicht getrennt werden.', en: 'The connection could not be removed.', es: 'No se pudo desconectar.' }),
        variant: 'destructive',
      });
    }
  }, [user, toast]);

  const listCloudFiles = useCallback(async () => {
    if (!user || !connection) return [];

    try {
      setSyncing(true);
      const { data, error } = await supabase.functions.invoke('cloud-storage-sync', {
        body: { action: 'list', user_id: user.id }
      });

      if (error) throw error;
      
      const files = data?.files || [];
      setCloudFiles(files);
      return files;
    } catch (err) {
      console.error('Error listing cloud files:', err);
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: tx({ de: 'Cloud-Dateien konnten nicht geladen werden.', en: 'Cloud files could not be loaded.', es: 'No se pudieron cargar los archivos en la nube.' }),
        variant: 'destructive',
      });
      return [];
    } finally {
      setSyncing(false);
    }
  }, [user, connection, toast]);

  const uploadToCloud = useCallback(async (fileUrl: string, fileName: string, mimeType: string) => {
    if (!user || !connection) return null;

    try {
      setSyncing(true);
      const { data, error } = await supabase.functions.invoke('cloud-storage-sync', {
        body: {
          action: 'upload',
          user_id: user.id,
          file_url: fileUrl,
          file_name: fileName,
          mime_type: mimeType,
        }
      });

      if (error) throw error;

      toast({
        title: '☁️ In Cloud hochgeladen',
        description: tx({ de: tx({ de: tx({ de: `${fileName} wurde in Google Drive gespeichert.`, en: `${fileName} was saved to Google Drive.`, es: `${fileName} se guardó en Google Drive.` }), en: tx({ de: `${fileName} was saved to Google Drive.`, en: `${fileName} was saved to Google Drive.`, es: `${fileName} se guardó en Google Drive.` }), es: `${fileName} se guardó en Google Drive.` }), en: tx({ de: tx({ de: `${fileName} was saved to Google Drive.`, en: `${fileName} was saved to Google Drive.`, es: `${fileName} se guardó en Google Drive.` }), en: tx({ de: `${fileName} was saved to Google Drive.`, en: `${fileName} was saved to Google Drive.`, es: `${fileName} se guardó en Google Drive.` }), es: `${fileName} se guardó en Google Drive.` }), es: `${fileName} se guardó en Google Drive.` }),
      });

      // Refresh file list
      await listCloudFiles();
      await fetchConnection();

      return data?.file;
    } catch (err) {
      console.error('Error uploading to cloud:', err);
      toast({
        title: 'Upload-Fehler',
        description: tx({ de: 'Datei konnte nicht in die Cloud hochgeladen werden.', en: 'File could not be uploaded to the cloud.', es: 'No se pudo subir el archivo a la nube.' }),
        variant: 'destructive',
      });
      return null;
    } finally {
      setSyncing(false);
    }
  }, [user, connection, toast, listCloudFiles, fetchConnection]);

  const deleteFromCloud = useCallback(async (driveFileId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase.functions.invoke('cloud-storage-sync', {
        body: { action: 'delete', user_id: user.id, drive_file_id: driveFileId }
      });

      if (error) throw error;

      setCloudFiles(prev => prev.filter(f => f.id !== driveFileId));
      
      toast({
        title: 'Gelöscht',
        description: tx({ de: 'Datei wurde aus Google Drive entfernt.', en: 'File was removed from Google Drive.', es: 'El archivo se eliminó de Google Drive.' }),
      });
    } catch (err) {
      console.error('Error deleting from cloud:', err);
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: tx({ de: 'Datei konnte nicht gelöscht werden.', en: 'File could not be deleted.', es: 'No se pudo eliminar el archivo.' }),
        variant: 'destructive',
      });
    }
  }, [user, toast]);

  const toggleAutoSync = useCallback(async (enabled: boolean) => {
    if (!user || !connection) return;

    try {
      const { error } = await supabase
        .from('cloud_storage_connections')
        .update({ auto_sync: enabled })
        .eq('user_id', user.id)
        .eq('provider', 'google_drive');

      if (error) throw error;

      setConnection(prev => prev ? { ...prev, auto_sync: enabled } : null);

      toast({
        title: enabled ? 'Auto-Sync aktiviert' : 'Auto-Sync deaktiviert',
        description: enabled 
          ? tx({ de: 'Neue Medien werden automatisch in Google Drive gespeichert.', en: 'New media is automatically saved to Google Drive.', es: 'Los nuevos medios se guardan automáticamente en Google Drive.' })
          : tx({ de: 'Medien werden nicht mehr automatisch hochgeladen.', en: 'Media is no longer uploaded automatically.', es: 'Los medios ya no se suben automáticamente.' }),
      });
    } catch (err) {
      console.error('Error toggling auto-sync:', err);
    }
  }, [user, connection, toast]);

  return {
    connection,
    cloudFiles,
    loading,
    syncing,
    connectGoogleDrive,
    handleOAuthCallback,
    disconnect,
    listCloudFiles,
    uploadToCloud,
    deleteFromCloud,
    toggleAutoSync,
    refetch: fetchConnection,
  };
};
