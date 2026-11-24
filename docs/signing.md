# Building, signing and shipping

## Why sign

Windows 11 turns **Smart App Control** on for new PCs. It blocks programs and libraries
it doesn't recognise unless they carry a valid code signature from a trusted
certificate authority. Electron, the brain's native files and llama-server don't come
signed, so an unsigned build of the companion simply won't start on those PCs (the
"An Application Control policy has blocked this file" error). Signing also makes the
SmartScreen "unknown publisher" warning go away over time.

## Getting a certificate

Pick one, then fill in `signing.local.json` (copy `signing.example.json`; git ignores
the local file, so nothing secret is committed).

### A. A code-signing certificate in your own name

Buy an **OV code-signing certificate for an individual** from a certificate authority
(for example Certum, Sectigo or SSL.com, directly or through a reseller). Since 2023
the private key must live on a hardware token or in the CA's cloud signing service.
Either way it shows up in the Windows certificate store when connected, and `signtool`
uses it from there.

1. Order it, pass the identity check, and install the token or cloud signing tool.
2. Find its thumbprint: `Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Format-List Subject, Thumbprint`
3. `signing.local.json`:
   ```json
   { "mode": "certificate", "publisherName": "Your Name", "certificateSha1": "THUMBPRINT" }
   ```
   (A `.pfx` file also works: leave out `certificateSha1` and set the `CSC_LINK` and
   `CSC_KEY_PASSWORD` environment variables instead.)

### B. Microsoft Artifact Signing (formerly Trusted Signing)

About $10 a month. **Individuals must be in the US or Canada**; UK *organisations* are
accepted, so this route needs a company (a UK Ltd is fine). Identity validation can
take from a day to a few weeks.

1. In the Azure portal: create an Artifact Signing account, do identity validation,
   and create a *Public Trust* certificate profile.
2. Create an app registration (service principal) with the *Certificate Profile Signer*
   role on the account (listed under Artifact Signing or Trusted Signing in the portal), and set `AZURE_TENANT_ID`,
   `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` in your environment.
3. `signing.local.json`:
   ```json
   {
     "mode": "azure",
     "publisherName": "Your Company Ltd",
     "endpoint": "https://weu.codesigning.azure.net",
     "codeSigningAccountName": "your-account",
     "certificateProfileName": "your-profile"
   }
   ```
   (`endpoint` is the one for the region you created the account in.)

## Building

On Windows, from the project folder:

| Command | Makes |
| --- | --- |
| `npm run dist` | `release\Desktop Companion Setup x.y.z.exe`: a one-click, per-user installer (no admin prompt) |
| `npm run dist:steam` | `release\win-unpacked\`: the folder to upload to Steam as a depot |

Both download llama-server (the vision helper) into `build\llama-server` the first
time, write `build\THIRD_PARTY_NOTICES.txt`, and sign every `.exe`, `.dll` and
`.node` in the app. Smart App Control checks all of them, not just the main program.
Without `signing.local.json` the build still works but isn't signed (it says so).

Check a build: `Get-AuthenticodeSignature "release\win-unpacked\Desktop Companion.exe"`
should say `Valid`.

## Developing on a PC with Smart App Control on

`npm run dev` runs Electron straight from `node_modules`, unsigned. Once you have a
certificate, sign that copy:

```
npm run sign:dev
```

Run it again whenever `npm install` replaces Electron. Please keep Smart App Control
on: Windows won't let you turn it back on without resetting the PC.

## Steam

- Upload `release\win-unpacked` as the Windows depot; the launch option is
  `Desktop Companion.exe`. Sign before uploading: Steam doesn't sign for you.
- Steam updates the files itself, so the app has no auto-updater of its own.
- `THIRD_PARTY_NOTICES.txt` (in `resources`), `LICENSE.electron.txt` and
  `LICENSES.chromium.html` ship with the app and cover the licences, including the
  SCOWL word list, llama.cpp and the models downloaded on first use.

## What's left out

- The brain's CUDA builds (about 600 MB): the Vulkan build runs on any graphics card,
  NVIDIA included, so it's used instead.
- Windows on Arm: x64 only for now.
