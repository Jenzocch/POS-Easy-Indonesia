import { describe, it, expect } from 'vitest'
import { friendlyError } from './friendlyError'

describe('friendlyError', () => {
  it('maps a TypeError("Failed to fetch") to the network message', () => {
    const err = new TypeError('Failed to fetch')
    expect(friendlyError(err)).toBe('Tidak ada koneksi internet. Periksa koneksi WiFi/data, lalu coba lagi.')
  })

  it('maps a generic network-ish message (timeout) to the network message', () => {
    expect(friendlyError(new Error('request timeout'))).toBe(
      'Tidak ada koneksi internet. Periksa koneksi WiFi/data, lalu coba lagi.'
    )
  })

  it('maps an auth/key error to the cloud-config message', () => {
    expect(friendlyError(new Error('Invalid API key'))).toBe(
      'Pengaturan cloud salah. Periksa URL dan kunci di menu Pengaturan.'
    )
  })

  it('treats any error from a cloud context as the cloud-config message when not a network failure', () => {
    expect(friendlyError(new Error('unexpected server response'), 'cloud')).toBe(
      'Pengaturan cloud salah. Periksa URL dan kunci di menu Pengaturan.'
    )
  })

  it('maps a CSV parse error to the csv-format message', () => {
    expect(friendlyError(new Error('CSV parse failed: unexpected token'))).toBe(
      'File tidak sesuai format. Pastikan menggunakan file CSV yang benar.'
    )
  })

  it('falls back to the generic message for unrecognized errors (e.g. Kasbon/IPC failures)', () => {
    expect(friendlyError(new Error('IPC channel closed unexpectedly'))).toBe(
      'Terjadi masalah. Coba lagi, atau hubungi pemilik toko jika masih gagal.'
    )
  })

  it('handles non-Error inputs (string, undefined) without throwing', () => {
    expect(friendlyError('plain string error')).toBe(
      'Terjadi masalah. Coba lagi, atau hubungi pemilik toko jika masih gagal.'
    )
    expect(friendlyError(undefined)).toBe(
      'Terjadi masalah. Coba lagi, atau hubungi pemilik toko jika masih gagal.'
    )
  })
})
