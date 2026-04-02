import { describe, expect, it } from 'vitest'

import { buildPracticeSessionScopeKey } from '@/lib/practice-overview'
import { createDefaultSettings } from '@/lib/practice-settings'

describe('practice overview scope keys', () => {
  it('returns the normal scope key when B2 exam mode is disabled', () => {
    const settings = createDefaultSettings()

    const scopeKey = buildPracticeSessionScopeKey(settings)
    expect(scopeKey).toBe('verb-A1')
  })

  it('appends a b2 suffix when B2 exam mode is enabled', () => {
    const settings = createDefaultSettings()
    settings.cefrLevelByPos.noun = 'B2'
    settings.b2ExamMode = true

    const scopeKey = buildPracticeSessionScopeKey(settings)
    expect(scopeKey).toBe('verb-A1__noun-B2__b2')
  })
})
