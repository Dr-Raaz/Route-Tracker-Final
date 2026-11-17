const USERNAME_INPUT_PATTERN = /^[A-Za-z0-9_]{3,24}$/;
const USERNAME_NORMALIZED_PATTERN = /^[a-z0-9_]{3,24}$/;

export interface UsernameValidation {
  normalized: string;
  error: string | null;
  valid: boolean;
}

/** Canonical username normalization mirrored by the PostgreSQL trigger. */
export function normalizeUsername(value: string): string {
  return value.replace(/^ +| +$/g, '').toLowerCase();
}

export function validateUsername(value: string): UsernameValidation {
  const trimmed = value.replace(/^ +| +$/g, '');
  const normalized = normalizeUsername(value);

  if (!USERNAME_INPUT_PATTERN.test(trimmed) || !USERNAME_NORMALIZED_PATTERN.test(normalized)) {
    return {
      normalized,
      error: 'Use 3 to 24 letters, numbers, or underscores. Usernames are not case-sensitive.',
      valid: false,
    };
  }

  return { normalized, error: null, valid: true };
}
