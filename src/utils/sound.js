// sound.js — synthesized audio feedback for scan/checkout (no audio files).
//
// History: DEAD-12 removed a dead reference to /public/notification.mp3 that never
// existed and always silently failed. We deliberately do NOT reintroduce a file
// dependency — tones are synthesized directly with the Web Audio API, which works
// offline with zero assets and zero packaging concerns.
//
// Everything here is wrapped in try/catch and must NEVER throw or block the
// calling code: audio can fail for many reasons (browser autoplay policy, no
// audio device, headless/test environment with no AudioContext at all).
import { getSetting } from './dataAccess'

let audioCtx = null
function getCtx() {
  if (audioCtx) return audioCtx
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!Ctx) return null // SSR / test environment — no-op
  audioCtx = new Ctx()
  return audioCtx
}

// Module-level cached flag — avoids making every beep() call await the async
// getSetting() round-trip (fire-and-forget UX). Populated once near app boot
// (useStore init) and refreshed whenever the user flips the toggle in
// SettingsPage. Deliberately simple: no reactive subscription system, just a
// cached boolean that defaults to "on" if unset/never loaded.
let soundEnabledCache = true

/** Called once at store init, and again whenever SettingsPage saves the toggle. */
export function setSoundEnabledCache(enabled) {
  soundEnabledCache = enabled !== false
}

/** Loads the persisted setting into the cache — call once near app boot. */
export async function loadSoundEnabledCache() {
  try {
    const v = await getSetting('soundEnabled')
    // getSetting returns null when never set → default to enabled ("on" out of
    // the box). Stored value is always the string 'true'/'false' (setSetting
    // must receive a string, not a boolean — better-sqlite3 rejects booleans).
    soundEnabledCache = v === null || v === undefined ? true : v !== 'false'
  } catch {
    soundEnabledCache = true
  }
  return soundEnabledCache
}

function tone(ctx, { freq, start, duration, volume = 0.2 }) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(ctx.destination)

  // Quick attack/decay envelope to avoid clicks/pops at the start/end of the tone.
  const t0 = start
  const attack = 0.01
  const release = 0.03
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(volume, t0 + attack)
  gain.gain.setValueAtTime(volume, t0 + duration - release)
  gain.gain.linearRampToValueAtTime(0, t0 + duration)

  osc.start(t0)
  osc.stop(t0 + duration)
}

function play(tones) {
  if (!soundEnabledCache) return
  try {
    const ctx = getCtx()
    if (!ctx) return
    const now = ctx.currentTime
    for (const spec of tones) tone(ctx, { ...spec, start: now + spec.offset })
  } catch {
    // Audio must never break the calling flow (autoplay policy, no device, etc.)
  }
}

/** Short, pleasant single tone for a successful scan/checkout. */
export function playSuccessBeep() {
  play([{ freq: 880, offset: 0, duration: 0.12, volume: 0.2 }])
}

/** Lower double-buzz that reads as "no/wrong" without being alarming. */
export function playErrorBeep() {
  play([
    { freq: 220, offset: 0,    duration: 0.1, volume: 0.18 },
    { freq: 220, offset: 0.14, duration: 0.1, volume: 0.18 },
  ])
}
