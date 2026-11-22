// Saves settings to the user's app data folder. API keys are encrypted with
// Windows' own credential protection (DPAPI via Electron safeStorage) and never
// sent to the window.
import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_SETTINGS, PROVIDERS, type ProviderId, type PublicSettings, type Settings } from '../shared/settings'

interface StoredFile {
  settings: Settings
  /** Base64 of encrypted key bytes, per provider. */
  keys: Partial<Record<ProviderId, string>>
  /** Other encrypted secrets (e.g. the Spotify sign-in), base64. */
  secrets?: Record<string, string>
}

const file = () => join(app.getPath('userData'), 'settings.json')

function read(): StoredFile {
  try {
    if (existsSync(file())) {
      const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<StoredFile>
      return { settings: { ...DEFAULT_SETTINGS, ...raw.settings }, keys: raw.keys ?? {}, secrets: raw.secrets ?? {} }
    }
  } catch (err) {
    console.error('Settings file unreadable, using defaults:', err)
  }
  return { settings: { ...DEFAULT_SETTINGS }, keys: {} }
}

function write(data: StoredFile): void {
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(data, null, 2))
}

export function getSettings(): Settings {
  return read().settings
}

export function getPublicSettings(): PublicSettings {
  const { settings, keys } = read()
  const hasKey: PublicSettings['hasKey'] = {}
  for (const p of PROVIDERS) hasKey[p.id] = Boolean(keys[p.id])
  return { ...settings, hasKey, spotifyConnected: Boolean(read().secrets?.spotifyRefresh) }
}

export function saveSettings(next: Settings): void {
  const data = read()
  data.settings = { ...DEFAULT_SETTINGS, ...next }
  write(data)
}

export function setApiKey(provider: ProviderId, key: string | null): void {
  const data = read()
  if (!key) {
    delete data.keys[provider]
  } else {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this system, so the key was not saved.')
    }
    data.keys[provider] = safeStorage.encryptString(key.trim()).toString('base64')
  }
  write(data)
}

export function getApiKey(provider: ProviderId): string | null {
  const stored = read().keys[provider]
  if (!stored) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return null
  }
}

/** Stores (or with null, removes) an encrypted secret. */
export function setSecret(name: string, value: string | null): void {
  const data = read()
  const secrets = { ...data.secrets }
  if (value === null) delete secrets[name]
  else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this system.')
    secrets[name] = safeStorage.encryptString(value).toString('base64')
  }
  write({ ...data, secrets })
}

export function getSecret(name: string): string | null {
  const stored = read().secrets?.[name]
  if (!stored) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return null
  }
}
