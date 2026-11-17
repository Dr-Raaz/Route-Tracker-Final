import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { ProfileRow } from '../services/supabase/database.types';
import { supabaseClient, supabaseConfigurationError } from '../services/supabase/client';
import {
  loadOwnProfile,
  requestEmailOtp,
  saveOwnProfile,
  signOutLocally,
  toUserFacingAuthError,
  verifyEmailOtp,
} from '../services/auth/authService';
import { authReducer, createInitialAuthState } from '../services/auth/authState';

export function useAuth() {
  const [state, dispatch] = useReducer(
    authReducer,
    supabaseConfigurationError,
    createInitialAuthState
  );
  const [isBusy, setIsBusy] = useState(false);
  const actionInFlight = useRef(false);
  const sessionGeneration = useRef(0);

  useEffect(() => {
    const client = supabaseClient;
    if (!client) return;

    let active = true;
    let resolvedUserId: string | null = null;
    let pendingProfileLoad: { userId: string; promise: Promise<void> } | null = null;

    const resolveSession = (session: Session | null, forceReload = false): Promise<void> => {
      if (!session) {
        sessionGeneration.current++;
        resolvedUserId = null;
        pendingProfileLoad = null;
        dispatch({ type: 'signed-out' });
        return Promise.resolve();
      }

      const userId = session.user.id;
      if (pendingProfileLoad?.userId === userId) return pendingProfileLoad.promise;
      if (!forceReload && resolvedUserId === userId) return Promise.resolve();

      if (resolvedUserId !== userId) resolvedUserId = null;
      const generation = ++sessionGeneration.current;
      const email = session.user.email ?? null;
      dispatch({ type: 'session-loading', userId, email });

      const promise = (async () => {
        try {
          const profile = await loadOwnProfile(client, userId);
          if (!active || generation !== sessionGeneration.current) return;
          resolvedUserId = userId;
          dispatch({ type: 'session-resolved', userId, email, profile });
        } catch (error) {
          if (!active || generation !== sessionGeneration.current) return;
          dispatch({
            type: 'profile-load-error',
            userId,
            email,
            message: toUserFacingAuthError(error),
          });
        }
      })();
      pendingProfileLoad = { userId, promise };
      void promise.then(() => {
        if (pendingProfileLoad?.promise === promise) pendingProfileLoad = null;
      });
      return promise;
    };

    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      // Defer Supabase data calls until after the Auth callback releases its internal lock.
      queueMicrotask(() => {
        if (!active) return;
        if (event === 'SIGNED_OUT' || !session) {
          void resolveSession(null);
          return;
        }

        // A new sign-in or changed user should refresh the profile. Token refreshes
        // reuse the resolved profile and must not start duplicate reads.
        const forceReload = event === 'USER_UPDATED';
        void resolveSession(session, forceReload);
      });
    });

    return () => {
      active = false;
      sessionGeneration.current++;
      pendingProfileLoad = null;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const runAction = useCallback(async (operation: (client: NonNullable<typeof supabaseClient>) => Promise<void>) => {
    if (!supabaseClient || actionInFlight.current) return false;
    actionInFlight.current = true;
    setIsBusy(true);
    dispatch({ type: 'clear-error' });
    try {
      await operation(supabaseClient);
      return true;
    } catch (error) {
      dispatch({ type: 'operation-error', message: toUserFacingAuthError(error) });
      return false;
    } finally {
      actionInFlight.current = false;
      setIsBusy(false);
    }
  }, []);

  const sendOtp = useCallback(
    (email: string) => runAction((client) => requestEmailOtp(client, email)),
    [runAction]
  );

  const verifyOtp = useCallback((email: string, token: string) => runAction(async (client) => {
    // The auth-state listener is the single source of truth for session
    // transitions and performs the one profile read for this sign-in.
    await verifyEmailOtp(client, email, token);
  }), [runAction]);

  const signOut = useCallback(() => runAction(async (client) => {
    await signOutLocally(client);
    dispatch({ type: 'signed-out' });
  }), [runAction]);

  const saveProfile = useCallback(async (input: { username: string; displayName: string }) => {
    if (!state.userId || (state.phase !== 'profile-setup' && state.phase !== 'authenticated')) return false;
    const userId = state.userId;
    const generation = sessionGeneration.current;
    let savedProfile: ProfileRow | null = null;
    const succeeded = await runAction(async (client) => {
      savedProfile = await saveOwnProfile(
        client,
        userId,
        input,
        state.phase === 'profile-setup'
      );
    });
    if (succeeded && savedProfile && generation === sessionGeneration.current) {
      dispatch({ type: 'profile-saved', profile: savedProfile });
    }
    return succeeded;
  }, [runAction, state.phase, state.userId]);

  const retryProfileLoad = useCallback(() => runAction(async (client) => {
    if (!state.userId) throw new Error('Sign in again to load your profile.');
    const userId = state.userId;
    const generation = sessionGeneration.current;
    const profile = await loadOwnProfile(client, userId);
    if (generation !== sessionGeneration.current) return;
    dispatch({
      type: 'session-resolved',
      userId,
      email: state.email,
      profile,
    });
  }), [runAction, state.email, state.userId]);

  return { state, isBusy, sendOtp, verifyOtp, signOut, saveProfile, retryProfileLoad };
}
