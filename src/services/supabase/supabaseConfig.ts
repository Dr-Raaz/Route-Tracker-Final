export interface SupabaseEnvironment {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface SupabaseConfiguration {
  url: string;
  publishableKey: string;
}

export type SupabaseConfigurationResult =
  | { configuration: SupabaseConfiguration; error: null }
  | { configuration: null; error: string };

function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3 || typeof globalThis.atob !== 'function') return null;

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = globalThis.atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const value: unknown = JSON.parse(decoded);
    if (value && typeof value === 'object' && 'role' in value && typeof value.role === 'string') {
      return value.role;
    }
  } catch {
    return null;
  }

  return null;
}

export function readSupabaseConfiguration(environment: SupabaseEnvironment): SupabaseConfigurationResult {
  const url = environment.VITE_SUPABASE_URL?.trim() ?? '';
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

  if (!url || !publishableKey) {
    return {
      configuration: null,
      error: 'Authentication is unavailable because VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing.',
    };
  }

  if (publishableKey.startsWith('sb_secret_') || jwtRole(publishableKey) === 'service_role' || /service[_-]?role/i.test(publishableKey)) {
    return {
      configuration: null,
      error: 'Authentication is disabled because the configured key is a server secret. Use a Supabase publishable key; never place a secret or service-role key in the client.',
    };
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('invalid URL');
    }
  } catch {
    return {
      configuration: null,
      error: 'Authentication is unavailable because VITE_SUPABASE_URL must be a valid HTTP or HTTPS URL.',
    };
  }

  return { configuration: { url, publishableKey }, error: null };
}
