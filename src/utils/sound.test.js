import { describe, it, expect } from 'vitest'
import { playSuccessBeep, playErrorBeep, setSoundEnabledCache } from './sound'

// This test suite runs in vitest's default 'node' environment (no `window`,
// no AudioContext) — exactly the "headless/no audio device" case the sound
// module must survive silently instead of throwing and breaking the calling
// code (barcode scan / checkout flows must never crash because of audio).
describe('sound.js (no AudioContext in this environment)', () => {
  it('playSuccessBeep never throws when AudioContext is unavailable', () => {
    expect(() => playSuccessBeep()).not.toThrow()
  })

  it('playErrorBeep never throws when AudioContext is unavailable', () => {
    expect(() => playErrorBeep()).not.toThrow()
  })

  it('still no-ops safely even when sound is toggled on/off via the cache', () => {
    setSoundEnabledCache(false)
    expect(() => playSuccessBeep()).not.toThrow()
    setSoundEnabledCache(true)
    expect(() => playErrorBeep()).not.toThrow()
  })
})
