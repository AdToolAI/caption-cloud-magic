import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
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

// Cache configuration
const SUBSCRIPTION_CACHE_KEY = 'subscription_cache';
const SUBSCRIPTION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SUBSCRIPTION_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes (was 60 seconds)

interface SubscriptionCache {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  cachedAt: number;
}

const getSubscriptionCache = (): SubscriptionCache | null => {
  try {
    const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (!cached) return null;
    
    const data = JSON.parse(cached) as SubscriptionCache;
    const isExpired = Date.now() - data.cachedAt > SUBSCRIPTION_CACHE_TTL;
    
    if (isExpired) {
      localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
      return null;
    }
    
    return data;
  } catch {
    return null;
  }
};

const setSubscriptionCache = (data: Omit<SubscriptionCache, 'cachedAt'>) => {
  try {
    const cache: SubscriptionCache = {
      ...data,
      cachedAt: Date.now()
    };
    localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Silently fail if localStorage is unavailable
  }
};

const clearSubscriptionCache = () => {
  try {
    localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
  } catch {
    // Silently fail
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);

  const checkSubscription = useCallback(async (forceRefresh = false) => {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getSubscriptionCache();
      if (cached) {
        console.log('[useAuth] Using cached subscription data');
        setSubscribed(cached.subscribed);
        setProductId(cached.productId);
        setSubscriptionEnd(cached.subscriptionEnd);
        return;
      }
    }

    try {
      console.log('[useAuth] Fetching subscription from Edge Function');
      const { data, error } = await supabase.functions.invoke('check-subscription');
      
      if (error) {
        console.error('Subscription check error:', error);
        setSubscribed(false);
        setProductId(null);
        setSubscriptionEnd(null);
        return;
      }

      if (data) {
        const subData = {
          subscribed: data.subscribed || false,
          productId: data.product_id || null,
          subscriptionEnd: data.subscription_end || null
        };
        
        // Update state
        setSubscribed(subData.subscribed);
        setProductId(subData.productId);
        setSubscriptionEnd(subData.subscriptionEnd);
        
        // Cache the result
        setSubscriptionCache(subData);
      }
    } catch (error) {
      console.error('Failed to check subscription:', error);
      setSubscribed(false);
      setProductId(null);
      setSubscriptionEnd(null);
    }
  }, []);

  const refreshSubscription = useCallback(async () => {
    // Force refresh bypasses cache
    await checkSubscription(true);
  }, [checkSubscription]);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        if (session?.user) {
          // Use cached data immediately, then background refresh
          setTimeout(() => {
            checkSubscription(false);
          }, 0);
        } else {
          setSubscribed(false);
          setProductId(null);
          setSubscriptionEnd(null);
          clearSubscriptionCache();
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (session?.user) {
        checkSubscription(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkSubscription]);

  // Auto-refresh subscription status every 5 minutes (was 60 seconds)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      checkSubscription(true); // Force refresh on interval
    }, SUBSCRIPTION_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [user, checkSubscription]);

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
      
      if (data.user) {
        localStorage.setItem('signup_date', new Date().toISOString());
        
        trackEvent(ANALYTICS_EVENTS.SIGNUP_COMPLETED, {
          email: data.user.email,
          signup_method: 'email',
        });
        
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
    clearSubscriptionCache();
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
