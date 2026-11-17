import assert from 'node:assert/strict';
import test from 'node:test';
import { readSupabaseConfiguration } from './supabaseConfig';

test('reports missing URL or publishable key without exposing environment values', () => {
  const result = readSupabaseConfiguration({ VITE_SUPABASE_URL: 'https://example.supabase.co' });
  assert.equal(result.configuration, null);
  assert.match(result.error ?? '', /VITE_SUPABASE_PUBLISHABLE_KEY/);
});

test('accepts an HTTP local URL and a publishable client key', () => {
  const result = readSupabaseConfiguration({
    VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  });
  assert.equal(result.error, null);
  assert.equal(result.configuration?.url, 'http://127.0.0.1:54321');
});

test('rejects Supabase secret keys in the browser configuration', () => {
  const result = readSupabaseConfiguration({
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do_not_use_in_browser',
  });
  assert.equal(result.configuration, null);
  assert.match(result.error ?? '', /server secret/);
});

test('rejects a legacy JWT with the service_role claim', () => {
  const result = readSupabaseConfiguration({
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'header.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
  });
  assert.equal(result.configuration, null);
  assert.match(result.error ?? '', /service-role key/);
});

test('rejects malformed service URLs', () => {
  const result = readSupabaseConfiguration({
    VITE_SUPABASE_URL: 'javascript:alert(1)',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  });
  assert.equal(result.configuration, null);
  assert.match(result.error ?? '', /valid HTTP or HTTPS URL/);
});
