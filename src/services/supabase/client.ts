import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { readSupabaseConfiguration } from './supabaseConfig';

const configurationResult = readSupabaseConfiguration({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

export let supabaseConfigurationError = configurationResult.error;
export let supabaseClient: SupabaseClient<Database> | null = null;

if (configurationResult.configuration) {
  try {
    supabaseClient = createClient<Database>(
      configurationResult.configuration.url,
      configurationResult.configuration.publishableKey,
      {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      }
    );
  } catch {
    supabaseConfigurationError = 'Authentication is unavailable because the Supabase configuration could not be initialized.';
  }
}
