// Packaging: `npm run dist` makes the Windows installer, `npm run dist:steam` the
// folder to upload to Steam. Both land in release/.
//
// Code signing (needed so Smart App Control and SmartScreen let the app run) is
// set up in signing.local.json (never committed); see docs/signing.md. Without
// it the build still works, it's just unsigned.
const { existsSync, readFileSync } = require('node:fs')

/** @type {{ mode?: 'azure' | 'certificate', publisherName?: string, endpoint?: string, codeSigningAccountName?: string, certificateProfileName?: string, certificateSha1?: string, certificateSubjectName?: string, timeStampServer?: string }} */
const signing = existsSync('signing.local.json') ? JSON.parse(readFileSync('signing.local.json', 'utf8')) : {}

function signingOptions() {
  if (signing.mode === 'azure') {
    for (const k of ['publisherName', 'endpoint', 'codeSigningAccountName', 'certificateProfileName'])
      if (!signing[k]) throw new Error(`signing.local.json: "${k}" is needed for Azure Artifact Signing`)
    return {
      azureSignOptions: {
        publisherName: signing.publisherName,
        endpoint: signing.endpoint,
        codeSigningAccountName: signing.codeSigningAccountName,
        certificateProfileName: signing.certificateProfileName
      }
    }
  }
  if (signing.mode === 'certificate') {
    // A certificate in the Windows certificate store (a USB token or a CA's cloud
    // signing tool puts it there), picked by thumbprint or name; or a .pfx file
    // given in the CSC_LINK and CSC_KEY_PASSWORD environment variables.
    return {
      signtoolOptions: {
        certificateSha1: signing.certificateSha1 || undefined,
        certificateSubjectName: signing.certificateSubjectName || undefined,
        publisherName: signing.publisherName || undefined,
        signingHashAlgorithms: ['sha256'],
        rfc3161TimeStampServer: signing.timeStampServer || 'http://timestamp.digicert.com'
      }
    }
  }
  console.warn('\n  No signing.local.json: this build will NOT be code-signed (Smart App Control may block it).\n')
  return { signExecutable: false }
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.kur1sho.desktopcompanion',
  productName: 'Desktop Companion',
  copyright: 'Copyright © 2026 Kur1sho',
  directories: { output: 'release', buildResources: 'build' },
  // Updates come through Steam, not from GitHub.
  publish: null,
  files: ['out/**', 'package.json'],
  // The built-in brain's native code has to be real files on disk to load.
  asarUnpack: ['node_modules/node-llama-cpp/**', 'node_modules/@node-llama-cpp/**'],
  // Its prebuilt binaries are used as they are; nothing to compile.
  npmRebuild: false,
  extraResources: [
    { from: 'build/llama-server', to: 'llama-server', filter: ['**/*'] },
    { from: 'build/THIRD_PARTY_NOTICES.txt', to: 'THIRD_PARTY_NOTICES.txt' },
    { from: 'build/icon.png', to: 'icon.png' }
  ],
  win: {
    target: ['nsis'],
    icon: 'build/icon.ico',
    // Smart App Control checks every program and library that loads, not just
    // the main .exe: Electron's DLLs, the brain's .node files and llama-server's DLLs.
    signExts: ['.dll', '.node'],
    ...signingOptions(),
    // x64 only, and the brain's Vulkan build (any graphics card) instead of the
    // CUDA ones, which would add about 600 MB for a small speed-up on NVIDIA cards.
    files: [
      '!node_modules/@node-llama-cpp/win-arm64/**',
      '!node_modules/@node-llama-cpp/win-x64-cuda/**',
      '!node_modules/@node-llama-cpp/win-x64-cuda-ext/**',
      '!node_modules/@node-llama-cpp/{linux,mac}-*/**'
    ]
  },
  nsis: {
    // One click, just for this user: no admin prompt.
    oneClick: true,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Desktop Companion',
    runAfterFinish: true,
    deleteAppDataOnUninstall: false
  },
  linux: {
    // Only for checking the package on Linux; the app is made for Windows.
    target: ['dir'],
    files: ['!node_modules/@node-llama-cpp/linux-x64-cuda*/**', '!node_modules/@node-llama-cpp/linux-arm*/**']
  }
}
