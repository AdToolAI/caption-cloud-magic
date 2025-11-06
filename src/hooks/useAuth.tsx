import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { identifyUser, resetUser, trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  refreshSubscription: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);

  const checkSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      
      if (error) {
        console.error('Subscription check error:', error);
        // Don't throw, just set to free tier on error
        setSubscribed(false);
        setProductId(null);
        setSubscriptionEnd(null);
        return;
      }

      if (data) {
        setSubscribed(data.subscribed || false);
        setProductId(data.product_id || null);
        setSubscriptionEnd(data.subscription_end || null);
      }
    } catch (error) {
      console.error('Failed to check subscription:', error);
      // Gracefully handle error - set to free tier
      setSubscribed(false);
      setProductId(null);
      setSubscriptionEnd(null);
    }
  };

  const refreshSubscription = async () => {
    await checkSubscription();
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Check subscription after auth state change
        if (session?.user) {
          setTimeout(() => {
            checkSubscription();
          }, 0);
        } else {
          setSubscribed(false);
          setProductId(null);
          setSubscriptionEnd(null);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (session?.user) {
        checkSubscription();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto-refresh subscription status every 60 seconds
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      checkSubscription();
    }, 60000);

    return () => clearInterval(interval);
  }, [user]);

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`
      }
    });
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Account created successfully!');
      
      // Track signup and identify user
      if (data.user) {
        // Store signup date in localStorage
        localStorage.setItem('signup_date', new Date().toISOString());
        
        trackEvent(ANALYTICS_EVENTS.SIGNUP_COMPLETED, {
          email: data.user.email,
          signup_method: 'email',
        });
        
        // Identify user with enriched properties
        identifyUser(data.user.id, { 
          email: data.user.email,
          signup_method: 'email',
        });
      }
    }
    
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Logged in successfully!');
      
      // Identify user on login with enriched properties
      if (data.user) {
        identifyUser(data.user.id, { 
          email: data.user.email,
          last_login: new Date().toISOString(),
        });
      }
    }
    
    return { error };
  };

  const signOut = async () => {
    resetUser();
    await supabase.auth.signOut();
    toast.success('Logged out successfully');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      subscribed, 
      productId, 
      subscriptionEnd,
      refreshSubscription,
      signUp, 
      signIn, 
      signOut 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};