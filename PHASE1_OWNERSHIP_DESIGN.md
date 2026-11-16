# Phase 1 cross-tab recording ownership

## Ownership lifecycle

Route Tracker will use one origin-scoped exclusive Web Lock named
`route-tracker:active-recording`. A single lock is intentional: the current
application has one tracking engine and one active journey slot, so allowing
multiple journeys from separate tabs would require a larger UI and state-model
change.

1. A start attempt requests the lock with `ifAvailable: true` before it creates
   a recording row or begins GPS acquisition. If another context holds it, the
   attempt fails visibly and does not create a journey.
2. The owning context holds the lock for the complete recording and finalizing
   lifecycle. It closes callback acceptance, stops acquisition, drains writes,
   commits final metadata, and then releases the lock.
3. If finalization fails, the owner retains the lock while it presents a retry.
   A second tab cannot take ownership while the first context can still retry.
4. On normal completion or an intentionally canceled empty start, the owner
   explicitly releases the lock. If the page crashes or closes, the browser
   releases its Web Lock when the context terminates.
5. Startup recovery requests that same lock without waiting. If unavailable,
   another active context owns the database and recovery skips its active rows.
   If acquired, recovery may atomically convert abandoned `recording` and
   `finalizing` rows to `interrupted`; it releases the lock after the recovery
   transactions finish. A later start cannot race the recovery scan/commit.
6. Storage continues to enforce `status === 'recording'` inside each sample
   transaction. The lock coordinates active browser contexts; the database
   remains the durable state authority.

## Unsupported or failed Web Locks

Web Locks is preferred because browser-held locks survive tab suspension and
are released by the user agent when the owning context is destroyed. The API is
widely available in current browsers but requires a secure context. If
`navigator.locks` is unavailable or a lock request fails, recording and
automatic recovery fail closed with a visible message. Route Tracker will not
fall back to a heartbeat or a localStorage read/modify/write lease: neither can
distinguish a suspended owner from an abandoned one safely. Existing journeys
remain in IndexedDB for a supported secure context to recover later.

## Startup notification coordination

The storage service coalesces overlapping recovery calls in one JavaScript
context and returns the same recovery result to each caller. Recovery itself is
serialized against starts and other tabs by the origin lock. This lets the
surviving React Strict Mode effect receive the result even if an earlier effect
was cleaned up. A later non-overlapping recovery call scans again and is
idempotent because already-interrupted journeys are not candidates.

## Compatibility basis

MDN describes Web Locks as widely available since March 2022 and restricted to
secure contexts. WebKit documents Safari support beginning with Safari 15.4.
The application must still feature-detect the API because older browsers,
embedded webviews, insecure origins, and policy-restricted contexts can omit it.

## Test boundary

Automated coordination tests will exercise the ownership manager's injected
lock-manager contract and storage tests will use `fake-indexeddb` against the
actual `IndexedDbService`. Actual browser lock lifetime across tab close,
crash, suspension, and WebView variants remains a manual browser test.
