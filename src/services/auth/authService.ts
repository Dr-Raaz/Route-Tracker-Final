import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database, ProfileRow } from '../supabase/database.types';
import { validateUsername } from '../../utils/username';

const PROFILE_FIELDS = 'user_id, username, display_name, created_at, updated_at';

export class UserFacingAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingAuthError';
  }
}

function safeErrorMetadata(error: unknown): { name?: string; code?: string; status?: number } {
  if (!error || typeof error !== 'object') return {};

  const record = error as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name : undefined;
  const code = typeof record.code === 'string' && /^[a-z0-9_-]{1,64}$/i.test(record.code)
    ? record.code
    : undefined;
  const status = typeof record.status === 'number' ? record.status : undefined;
  return { name, code, status };
}

function logUnexpectedAuthError(error: unknown): void {
  if (import.meta.env?.DEV) {
    // Never log error messages, request payloads, email addresses, tokens, or headers.
    console.warn('[auth] Request failed with an unexpected error.', safeErrorMetadata(error));
  }
}

export function toUserFacingAuthError(error: unknown): string {
  if (error instanceof UserFacingAuthError) return error.message;

  const { code, status } = safeErrorMetadata(error);
  const normalizedCode = code?.toLowerCase() ?? '';

  if (status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(normalizedCode)) {
    return 'Too many verification attempts. Wait a little while before requesting another code.';
  }
  if (['otp_expired', 'otp_disabled', 'invalid_credentials', 'token_expired'].includes(normalizedCode)) {
    return 'That verification code is invalid or expired. Request a new code and try again.';
  }
  if (['session_expired', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt'].includes(normalizedCode)) {
    return 'Your session has expired. Sign in again to continue.';
  }
  if (normalizedCode === 'email_not_confirmed') {
    return 'Verify your email address before continuing. Request a new code if needed.';
  }
  if (['email_provider_disabled', 'signup_disabled'].includes(normalizedCode)) {
    return 'Email sign-in is currently unavailable. Contact the application administrator.';
  }
  if (normalizedCode === 'email_address_invalid') {
    return 'Enter a valid email address.';
  }
  if (normalizedCode === '23505') {
    return 'That username is already in use. Choose another one.';
  }
  if (normalizedCode === '23514') {
    return 'Some profile information is invalid. Check the username and display name and try again.';
  }
  if (normalizedCode === '42501' || status === 403) {
    return 'Your account is not permitted to make this change. Verify your email and sign in again if needed.';
  }
  if (status === 401) {
    return 'Your session has expired. Sign in again to continue.';
  }

  const message = error instanceof Error ? error.message : '';
  if (error instanceof TypeError || /fetch|network|connection/i.test(message)) {
    return 'Could not reach the authentication service. Check your connection and try again.';
  }

  logUnexpectedAuthError(error);
  return 'The authentication request could not be completed. Please try again.';
}

export async function requestEmailOtp(client: SupabaseClient<Database>, email: string): Promise<void> {
  const normalizedEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new UserFacingAuthError('Enter a valid email address.');
  }

  const { error } = await client.auth.signInWithOtp({
    email: normalizedEmail,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyEmailOtp(
  client: SupabaseClient<Database>,
  email: string,
  token: string
): Promise<Session> {
  if (!/^\d{6}$/.test(token.trim())) throw new UserFacingAuthError('Enter the 6-digit code from your email.');

  const { data, error } = await client.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
  if (!data.session || !data.user?.email_confirmed_at) {
    throw new UserFacingAuthError('Email verification did not complete. Request a new code and try again.');
  }
  return data.session;
}

export async function loadOwnProfile(
  client: SupabaseClient<Database>,
  userId: string
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveOwnProfile(
  client: SupabaseClient<Database>,
  userId: string,
  profile: { username: string; displayName: string },
  isNew: boolean
): Promise<ProfileRow> {
  const validation = validateUsername(profile.username);
  if (!validation.valid) throw new UserFacingAuthError(validation.error ?? 'Enter a valid username.');

  const displayName = profile.displayName.replace(/^ +| +$/g, '');
  if (displayName.length > 60) throw new UserFacingAuthError('Display name must be 60 characters or fewer.');

  const values = {
    username: validation.normalized,
    display_name: displayName || null,
  };
  const result = isNew
    ? await client.from('profiles').insert({ user_id: userId, ...values }).select(PROFILE_FIELDS).single()
    : await client.from('profiles').update(values).eq('user_id', userId).select(PROFILE_FIELDS).single();

  if (result.error?.code === '23505') {
    throw new UserFacingAuthError('That username is already in use. Choose another one.');
  }
  if (result.error) throw result.error;
  return result.data;
}

export async function signOutLocally(client: SupabaseClient<Database>): Promise<void> {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
}
