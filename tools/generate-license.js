#!/usr/bin/env node
/**
 * License key generator — OWNER-ONLY TOOL. NEVER SHIP THIS FILE (OR THE PRIVATE KEY IT WRITES)
 * IN THE PACKAGED APP.
 *
 * electron-builder's `build.files` in package.json is an explicit allowlist
 * (dist/**, electron/**, public/menu/**) — tools/ is not listed, so this script and
 * tools/license-private-key.pem never end up in the installer. Do not add tools/ to
 * that allowlist. Also do not commit tools/license-private-key.pem to git (see
 * .gitignore — this repo's .gitignore has an explicit entry for it).
 *
 * Usage:
 *   node tools/generate-license.js
 *     First run with no keypair on disk: generates a fresh Ed25519 keypair, saves the
 *     private key to tools/license-private-key.pem, and prints the public key (SPKI PEM)
 *     to paste into electron/license.js's LICENSE_PUBLIC_KEY constant.
 *
 *   node tools/generate-license.js --tier warung --to "Toko Sari Rasa" [--expires 2027-12-31]
 *     Issues a signed license code for a customer/store.
 *     --tier      required, one of the paid KASBON_LIMITS tiers (not 'free')
 *     --to        required, store/customer name — shown in-app, so a leaked/shared code
 *                 visibly displays someone else's store name (tamper-evidence)
 *     --expires   optional, YYYY-MM-DD
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// Mirrors electron/kasbon-shared.js KASBON_LIMITS (source of truth) — keep in sync, see
// kasbon-shared.js header comment for why this repo keeps parallel CJS copies of shared constants.
const KASBON_LIMITS = {
  free: { perMember: 0, perStore: 0 },
  warung: { perMember: 50e6, perStore: 500e6 },
  resto: { perMember: 500e6, perStore: 5e9 },
}
const LICENSABLE_TIERS = Object.keys(KASBON_LIMITS).filter((t) => t !== 'free')

const PRIVATE_KEY_PATH = path.join(__dirname, 'license-private-key.pem')

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
      out[key] = val
    }
  }
  return out
}

function ensureKeypair() {
  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    return fs.readFileSync(PRIVATE_KEY_PATH, 'utf8')
  }

  console.log('No keypair found — generating a new Ed25519 keypair...\n')
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')

  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' })

  fs.writeFileSync(PRIVATE_KEY_PATH, privatePem, { mode: 0o600 })

  console.log(`Private key saved to: ${PRIVATE_KEY_PATH}`)
  console.log('(This file is gitignored. Back it up somewhere safe — losing it means you')
  console.log('cannot issue new licenses; a leak means anyone can forge licenses.)\n')
  console.log('Paste this public key into electron/license.js as LICENSE_PUBLIC_KEY:\n')
  console.log(publicPem)

  return privatePem
}

function isValidDateString(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime())
}

function issueLicense(privatePem, { tier, to, expires }) {
  const privateKey = crypto.createPrivateKey(privatePem)

  const payload = {
    tier,
    to,
    expires: expires || null,
    issuedAt: new Date().toISOString(),
    v: 1,
  }

  const payloadJson = JSON.stringify(payload)
  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url')
  const signature = crypto.sign(null, Buffer.from(payloadJson, 'utf8'), privateKey)
  const signatureB64 = signature.toString('base64url')

  return `${payloadB64}.${signatureB64}`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const privatePem = ensureKeypair()

  // No --tier/--to given: this was just a keypair-generation (or keypair-already-exists) run.
  if (!args.tier && !args.to) {
    if (fs.existsSync(PRIVATE_KEY_PATH) && !args.tier) {
      console.log('Keypair already exists. To issue a license, run:')
      console.log('  node tools/generate-license.js --tier warung --to "Toko Sari Rasa" [--expires 2027-12-31]')
    }
    return
  }

  if (!args.tier || !LICENSABLE_TIERS.includes(args.tier)) {
    console.error(`Error: --tier is required and must be one of: ${LICENSABLE_TIERS.join(', ')}`)
    console.error(`('free' is not licensable — there is nothing to unlock.)`)
    process.exit(1)
  }

  if (!args.to || typeof args.to !== 'string') {
    console.error('Error: --to "<store or customer name>" is required.')
    process.exit(1)
  }

  if (args.expires && (args.expires === true || !isValidDateString(args.expires))) {
    console.error('Error: --expires must be YYYY-MM-DD, e.g. --expires 2027-12-31')
    process.exit(1)
  }

  const code = issueLicense(privatePem, {
    tier: args.tier,
    to: args.to,
    expires: args.expires || null,
  })

  console.log(`Tier:    ${args.tier}`)
  console.log(`To:      ${args.to}`)
  console.log(`Expires: ${args.expires || '(never)'}`)
  console.log('\nLicense code:')
  console.log(code)
  console.log('')
}

main()
