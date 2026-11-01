import { test } from 'node:test'
import assert from 'node:assert/strict'

import { urlVercel } from './alta-io.ts'

test('urlVercel: agrega teamId solo si hay', () => {
  assert.equal(urlVercel('/v9/projects/p'), 'https://api.vercel.com/v9/projects/p')
  assert.equal(urlVercel('/v9/projects/p', 'team_1'), 'https://api.vercel.com/v9/projects/p?teamId=team_1')
  assert.equal(
    urlVercel('/v10/projects/p/env', 'team_1', 'upsert=true'),
    'https://api.vercel.com/v10/projects/p/env?upsert=true&teamId=team_1',
  )
  assert.equal(urlVercel('/v10/projects/p/env', undefined, 'upsert=true'), 'https://api.vercel.com/v10/projects/p/env?upsert=true')
})
