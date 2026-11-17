import type { ProfileRow } from '../supabase/database.types';

export type AuthPhase =
  | 'loading'
  | 'configuration-error'
  | 'signed-out'
  | 'profile-setup'
  | 'authenticated'
  | 'error';

export interface AuthState {
  phase: AuthPhase;
  userId: string | null;
  email: string | null;
  profile: ProfileRow | null;
  error: string | null;
}

export type AuthAction =
  | { type: 'configuration-error'; message: string }
  | { type: 'session-loading'; userId: string; email: string | null }
  | { type: 'session-resolved'; userId: string; email: string | null; profile: ProfileRow | null }
  | { type: 'profile-load-error'; message: string; userId: string; email: string | null }
  | { type: 'profile-saved'; profile: ProfileRow }
  | { type: 'signed-out' }
  | { type: 'operation-error'; message: string }
  | { type: 'clear-error' };

export function createInitialAuthState(configurationError: string | null): AuthState {
  if (configurationError) {
    return {
      phase: 'configuration-error',
      userId: null,
      email: null,
      profile: null,
      error: configurationError,
    };
  }
  return { phase: 'loading', userId: null, email: null, profile: null, error: null };
}

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'configuration-error':
      return { phase: 'configuration-error', userId: null, email: null, profile: null, error: action.message };
    case 'session-loading':
      return { phase: 'loading', userId: action.userId, email: action.email, profile: null, error: null };
    case 'session-resolved':
      return {
        phase: action.profile ? 'authenticated' : 'profile-setup',
        userId: action.userId,
        email: action.email,
        profile: action.profile,
        error: null,
      };
    case 'profile-load-error':
      return { phase: 'error', userId: action.userId, email: action.email, profile: null, error: action.message };
    case 'profile-saved':
      return {
        phase: 'authenticated',
        userId: action.profile.user_id,
        email: state.email,
        profile: action.profile,
        error: null,
      };
    case 'signed-out':
      return { phase: 'signed-out', userId: null, email: null, profile: null, error: null };
    case 'operation-error':
      return { ...state, error: action.message };
    case 'clear-error':
      return { ...state, error: null };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
