import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import { signOutLocally, toUserFacingAuthError, UserFacingAuthError } from './authService';

test('maps known OTP rate-limit errors to a useful message', () => {
  const error = Object.assign(new Error('sensitive provider response'), {
    code: 'over_email_send_rate_limit', status: 429,
  });
  assert.match(toUserFacingAuthError(error), /Too many verification attempts/);
  assert.doesNotMatch(toUserFacingAuthError(error), /sensitive provider response/);
});

test('maps expired OTP, unconfirmed email, and expired session errors', () => {
  assert.match(toUserFacingAuthError(Object.assign(new Error('private'), { code: 'otp_expired' })), /verification code is invalid or expired/);
  assert.match(toUserFacingAuthError(Object.assign(new Error('private'), { code: 'email_not_confirmed' })), /Verify your email address/);
  assert.match(toUserFacingAuthError(Object.assign(new Error('private'), { code: 'session_expired' })), /session has expired/);
});

test('maps known database errors without exposing backend details', () => {
  const duplicate = Object.assign(new Error('duplicate key value includes private data'), { code: '23505' });
  const permission = Object.assign(new Error('raw policy detail'), { code: '42501' });
  assert.match(toUserFacingAuthError(duplicate), /username is already in use/);
  assert.match(toUserFacingAuthError(permission), /not permitted/);
  assert.doesNotMatch(toUserFacingAuthError(duplicate), /private data/);
  assert.doesNotMatch(toUserFacingAuthError(permission), /raw policy detail/);
});

test('preserves local validation messages but hides unexpected server messages', () => {
  assert.equal(toUserFacingAuthError(new UserFacingAuthError('Enter a valid email address.')), 'Enter a valid email address.');
  assert.equal(
    toUserFacingAuthError(new Error('database host, token, and raw backend details')),
    'The authentication request could not be completed. Please try again.'
  );
});

test('ordinary logout requests local scope', async () => {
  let receivedScope: string | undefined;
  const client = {
    auth: {
      signOut: async (options: { scope: string }) => {
        receivedScope = options.scope;
        return { error: null };
      },
    },
  } as unknown as SupabaseClient<Database>;

  await signOutLocally(client);
  assert.equal(receivedScope, 'local');
});

test('local logout propagates a failed signout request', async () => {
  const client = {
    auth: {
      signOut: async () => ({ error: new Error('network unavailable') }),
    },
  } as unknown as SupabaseClient<Database>;

  await assert.rejects(() => signOutLocally(client));
});
