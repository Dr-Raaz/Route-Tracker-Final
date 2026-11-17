import assert from 'node:assert/strict';
import test from 'node:test';
import { authReducer, createInitialAuthState } from './authState';
import type { ProfileRow } from '../supabase/database.types';

const profile: ProfileRow = {
  user_id: 'user-1',
  username: 'route_user',
  display_name: null,
  created_at: '2026-11-16T00:00:00.000Z',
  updated_at: '2026-11-16T00:00:00.000Z',
};

test('auth state restores a session into profile setup until a profile exists', () => {
  const loading = createInitialAuthState(null);
  const result = authReducer(loading, {
    type: 'session-resolved',
    userId: 'user-1',
    email: 'person@example.com',
    profile: null,
  });
  assert.equal(result.phase, 'profile-setup');
  assert.equal(result.userId, 'user-1');
  assert.equal(result.profile, null);
});

test('auth state enters authenticated only after a profile is loaded', () => {
  const result = authReducer(createInitialAuthState(null), {
    type: 'session-resolved',
    userId: profile.user_id,
    email: 'person@example.com',
    profile,
  });
  assert.equal(result.phase, 'authenticated');
  assert.equal(result.profile?.username, 'route_user');
});

test('profile-load failure preserves the signed-in identity for retry or logout', () => {
  const result = authReducer(createInitialAuthState(null), {
    type: 'profile-load-error',
    userId: 'user-1',
    email: 'person@example.com',
    message: 'Network unavailable.',
  });
  assert.equal(result.phase, 'error');
  assert.equal(result.userId, 'user-1');
  assert.equal(result.error, 'Network unavailable.');
});

test('sign out clears restored identity and profile', () => {
  const signedIn = authReducer(createInitialAuthState(null), {
    type: 'session-resolved', userId: profile.user_id, email: 'person@example.com', profile,
  });
  const result = authReducer(signedIn, { type: 'signed-out' });
  assert.equal(result.phase, 'signed-out');
  assert.equal(result.userId, null);
  assert.equal(result.email, null);
  assert.equal(result.profile, null);
  assert.equal(result.error, null);
});

test('missing client configuration has a distinct visible state', () => {
  const result = createInitialAuthState('Supabase configuration missing.');
  assert.equal(result.phase, 'configuration-error');
  assert.equal(result.error, 'Supabase configuration missing.');
});
