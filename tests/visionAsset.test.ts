import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, desktopCapturer: {}, screen: {}, utilityProcess: {} }))
import { scoreAsset } from '../src/main/brain/vision'

describe('scoreAsset', () => {
  const win = (n: string) => scoreAsset(n, 'win32', 'x64')
  it('prefers the Windows Vulkan build, then CPU', () => {
    expect(win('llama-b9196-bin-win-vulkan-x64.zip')).toBeGreaterThan(win('llama-b9196-bin-win-cpu-x64.zip'))
    expect(win('llama-b9196-bin-win-cpu-x64.zip')).toBeGreaterThan(0)
  })
  it('copes with renamed files', () => {
    expect(win('llama-b9300-bin-windows-x64-vulkan.zip')).toBe(3)
  })
  it('skips builds that need extra installs or other PCs', () => {
    expect(win('llama-b9196-bin-win-cuda-12.4-x64.zip')).toBe(0)
    expect(win('cudart-llama-bin-win-cuda-12.4-x64.zip')).toBe(0)
    expect(win('llama-b9196-bin-win-cpu-arm64.zip')).toBe(0)
    expect(win('llama-b9196-bin-ubuntu-x64.zip')).toBe(0)
    expect(win('llama-b9196-xcframework.zip')).toBe(0)
  })
  it('finds the Linux build for testing', () => {
    expect(scoreAsset('llama-b9196-bin-ubuntu-vulkan-x64.tar.gz', 'linux', 'x64')).toBe(3)
  })
})
