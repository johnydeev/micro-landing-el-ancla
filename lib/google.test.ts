import { test } from 'node:test'
import assert from 'node:assert/strict'

import { SCOPES, urlConsentimiento } from './google.ts'

test('urlConsentimiento: offline, consent y los dos scopes', () => {
  const url = new URL(
    urlConsentimiento({
      clientId: 'cliente.apps.googleusercontent.com',
      redirectUri: 'http://localhost:53682',
      state: 'abc123',
    }),
  )
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.equal(url.searchParams.get('client_id'), 'cliente.apps.googleusercontent.com')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:53682')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('access_type'), 'offline')
  assert.equal(url.searchParams.get('prompt'), 'consent')
  assert.equal(url.searchParams.get('state'), 'abc123')
  assert.deepEqual(url.searchParams.get('scope')?.split(' '), SCOPES)
})
