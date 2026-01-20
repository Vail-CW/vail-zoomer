# Code Signing Guide

This document explains how to set up code signing for Vail Zoomer releases on Windows and macOS. Code signing is important because:

1. **Users won't see scary warnings** - Unsigned apps trigger security warnings on both platforms
2. **macOS Gatekeeper** - Without signing and notarization, macOS will block the app
3. **Windows SmartScreen** - Unsigned apps show "Windows protected your PC" warnings

---

## macOS Code Signing & Notarization

### Requirements
- Apple Developer account ($99/year)
- Xcode installed
- Developer ID Application certificate

### Step 1: Create a Developer ID Certificate

1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/certificates/list)
2. Click **+** to create a new certificate
3. Select **Developer ID Application** (for distributing outside App Store)
4. Follow the prompts to create a Certificate Signing Request (CSR) using Keychain Access
5. Download and install the certificate

### Step 2: Export the Certificate

1. Open **Keychain Access**
2. Find your "Developer ID Application: Your Name" certificate
3. Right-click → **Export**
4. Save as `.p12` file with a strong password

### Step 3: Set Up GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` certificate. Generate with: `base64 -i certificate.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `KEYCHAIN_PASSWORD` | Any secure password (used temporarily during CI) |
| `APPLE_SIGNING_IDENTITY` | Your certificate name, e.g., `Developer ID Application: Your Name (TEAM_ID)` |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | App-specific password (create at appleid.apple.com) |
| `APPLE_TEAM_ID` | Your 10-character Team ID (find in Apple Developer portal) |

### Step 4: Configure Tauri for Notarization

The GitHub Actions workflow is already configured to use these secrets. When you push a tag, the app will be:
1. Code signed with your Developer ID
2. Submitted to Apple for notarization
3. Stapled with the notarization ticket

---

## Windows Code Signing

### Option 1: EV Code Signing Certificate (Recommended)

Extended Validation certificates provide the highest trust level and immediately remove SmartScreen warnings.

**Providers:**
- DigiCert (~$400-700/year)
- Sectigo (~$300-500/year)
- GlobalSign (~$400-600/year)

**Note:** EV certificates require a hardware token (USB) and cannot be used in CI directly. You'll need to sign locally or use a cloud signing service.

### Option 2: OV Code Signing Certificate

Organization Validation certificates are cheaper but require building reputation with SmartScreen.

**Providers:**
- SSL.com (~$200-300/year)
- Certum (~$100-200/year)
- Sectigo (~$200-300/year)

### Option 3: Self-Signed (Development Only)

For testing, you can create a self-signed certificate. Users will still see warnings, but you can test the signing process.

```powershell
# Create self-signed certificate (PowerShell as Admin)
New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Vail Zoomer Dev" -CertStoreLocation Cert:\CurrentUser\My

# Export to PFX
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*Vail Zoomer Dev*" }
$password = ConvertTo-SecureString -String "YourPassword" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath certificate.pfx -Password $password
```

### Setting Up GitHub Secrets for Windows

| Secret | Description |
|--------|-------------|
| `WINDOWS_CERTIFICATE` | Base64-encoded `.pfx` certificate. Generate with PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx"))` |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the `.pfx` file |

### Alternative: Azure Trusted Signing

Microsoft offers [Azure Trusted Signing](https://azure.microsoft.com/en-us/products/trusted-signing/) which provides:
- No hardware token required
- CI/CD integration
- Lower cost (~$10/month)

---

## Without Code Signing

If you distribute without code signing, users will see warnings:

### macOS
Users must:
1. Try to open the app (will be blocked)
2. Go to **System Settings → Privacy & Security**
3. Click **"Open Anyway"** next to the Vail Zoomer message

Or via Terminal:
```bash
xattr -cr /Applications/Vail\ Zoomer.app
```

### Windows
Users must:
1. Click **"More info"** on the SmartScreen warning
2. Click **"Run anyway"**

---

## Tauri Update Signing

For auto-updates, Tauri uses its own signing system separate from OS code signing.

### Generate Update Signing Keys

```bash
# Generate a keypair for Tauri updates
npx @tauri-apps/cli signer generate -w ~/.tauri/vail-zoomer.key
```

This creates:
- `~/.tauri/vail-zoomer.key` - Private key (keep secret!)
- `~/.tauri/vail-zoomer.key.pub` - Public key (embed in app)

### Add to GitHub Secrets

| Secret | Description |
|--------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of the `.key` file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password used when generating the key |

The public key goes in `tauri.conf.json` under `plugins.updater.pubkey`.

---

## Summary Checklist

### For macOS Distribution
- [ ] Apple Developer account
- [ ] Developer ID Application certificate
- [ ] Export certificate as `.p12`
- [ ] Create app-specific password
- [ ] Add all secrets to GitHub

### For Windows Distribution
- [ ] Purchase OV/EV code signing certificate (or use Azure Trusted Signing)
- [ ] Export certificate as `.pfx`
- [ ] Add secrets to GitHub

### For Both (Optional but Recommended)
- [ ] Generate Tauri update signing keys
- [ ] Add update signing secrets to GitHub
