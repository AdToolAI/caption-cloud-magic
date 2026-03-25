import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface CollaborationPost {
  id: string;
  user_id: string;
  title: string;
  description: string;
  skills_needed: string[];
  status: string;
  created_at: string;
  updated_at: string;
  profiles?: { email: string } | null;
}

export function useCollaborations() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<CollaborationPost[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPosts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("collaboration_posts")
      .select("*, profiles:user_id(email)")
      .order("created_at", { ascending: false });

    if (error) console.error(error);
    else setPosts((data as any[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const createPost = async (title: string, description: string, skillsNeeded: string[]) => {
    if (!user) return;
    const { error } = await supabase.from("collaboration_posts").insert({
      user_id: user.id,
      title,
      description,
      skills_needed: skillsNeeded,
    });
    if (error) {
      toast.error("Post konnte nicht erstellt werden");
      console.error(error);
      return;
    }
    toast.success("Kollaborations-Post erstellt!");
    fetchPosts();
  };

  const updateStatus = async (postId: string, status: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("collaboration_posts")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", postId);
    if (error) {
      toast.error("Status konnte nicht aktualisiert werden");
      return;
    }
    toast.success("Status aktualisiert!");
    fetchPosts();
  };

  return { posts, loading, createPost, updateStatus, refetch: fetchPosts };
}
