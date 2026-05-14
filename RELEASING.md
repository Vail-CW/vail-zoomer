# Releasing Vail Zoomer

This document describes how to cut an official release. The release pipeline is
fully automated by GitHub Actions — pushing a `v*` tag triggers a build across
Windows, macOS (x64 + arm64), and Linux, and creates a draft release with
signed updater artifacts.

## Prerequisites

- Push access to `Vail-CW/vail-zoomer`.
- These GitHub repository secrets must already be configured (one-time setup):
  - `TAURI_SIGNING_PRIVATE_KEY` — updater signing key (minisign format).
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — passphrase for the signing key.
  - Code-signing secrets, if/when those are added — see [SIGNING.md](SIGNING.md).

The signing key pair is what the auto-updater uses to verify update bundles.
The matching public key lives in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json)
under `plugins.updater.pubkey`. **Do not rotate the private key without also
shipping a release that updates `pubkey`** — clients with the old public key
will reject updates signed by the new private key.

## Release steps

### 1. Bump the version

The version must match in three files. Use the same value (no `v` prefix, plain
SemVer):

- [`package.json`](package.json) — `"version"`
- [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml) — `version`
- [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) — `"version"`

> **Windows MSI quirk:** if you use a SemVer pre-release suffix (e.g.
> `0.2.7-test`), the MSI bundler will fail with "pre-release identifier must
> be numeric-only." Use a numeric pre-release (`0.2.7-1`) or no suffix at all
> for the final release.

### 2. Commit and push to `main`

```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json <other files>
git commit -m "Release v0.2.7 - <short summary>"
git push origin main
```

Prior releases have been merged directly to `main` rather than via PR. If you
want a review step, open a PR and merge it before tagging.

### 3. Tag the release commit

```bash
git tag v0.2.7
git push origin v0.2.7
```

The tag **must** start with `v` (the workflow filter is `tags: ['v*']`). The
tag name is what ends up in artifact filenames
(`Vail.Zoomer-v0.2.7-windows-x64.zip`) and in the updater's `latest.json`.

### 4. Wait for CI

The [Release workflow](.github/workflows/release.yml) runs four parallel
platform jobs (~5-8 min each), then a release job that:

1. Downloads each platform's bundle.
2. Zips them per OS (`Vail.Zoomer-vX.Y.Z-<os>.zip`).
3. Signs each zip with the updater key, producing a `.sig` file.
4. Generates `latest.json` containing the signed update manifest.
5. Creates a **draft** GitHub Release with all zips + `latest.json`.

Monitor the run at:
<https://github.com/Vail-CW/vail-zoomer/actions/workflows/release.yml>

If a job fails, fix the underlying issue, delete the tag locally and on the
remote, and re-tag:

```bash
git tag -d v0.2.7
git push origin :refs/tags/v0.2.7
# fix...
git tag v0.2.7 && git push origin v0.2.7
```

### 5. Edit release notes and publish

CI leaves the release as a draft with a generic installation-instructions body.
Open the draft at <https://github.com/Vail-CW/vail-zoomer/releases>, replace
the body with real release notes (see template below), and click **Publish
release**.

The auto-updater only sees published (non-draft) releases. Until you publish,
existing users will not get prompted to update.

#### Release notes template

```markdown
## What's new in v0.2.7

- **<Headline change>** — one-sentence description focused on user impact.
- <Other change>

## Installation

Download the zip for your operating system below, extract it, and run the
installer inside. See the [README](https://github.com/Vail-CW/vail-zoomer#readme)
for first-time setup (virtual audio device).

## Upgrading

If you're already running Vail Zoomer, you'll be prompted to auto-update on
next launch — no manual download needed.
```

### 6. Update vailadapter.com (manual)

Asset filenames contain the version (`Vail.Zoomer-v0.2.7-windows-x64.zip`), so
any direct download link on vailadapter.com pins to the previous version and
must be updated each release. Either:

- Update the link to the new version's URL, **or**
- Point the link at the GitHub Releases page so users always see the latest
  (<https://github.com/Vail-CW/vail-zoomer/releases/latest>).

### 7. Sync local `main` to remote (if needed)

If you released from a branch other than `main`, reset your local `main` so it
matches the release commit:

```bash
git fetch origin
git checkout main
git reset --hard origin/main
```

## Triggering manually without a tag

The workflow also supports `workflow_dispatch` with a version input. Go to the
[Release workflow page](https://github.com/Vail-CW/vail-zoomer/actions/workflows/release.yml),
click **Run workflow**, enter a version, and run. This builds the platforms but
does **not** create a release (the release job only runs when the trigger was
a tag push). Use this for verifying the build works without committing to a
release.

## How the auto-updater finds new releases

`src-tauri/tauri.conf.json` pins the updater endpoint to:

```
https://github.com/Vail-CW/vail-zoomer/releases/latest/download/latest.json
```

GitHub's `/releases/latest/download/<filename>` redirects to that filename on
the most recent **non-prerelease, non-draft** release. So as long as the
release is published (not a draft) and not flagged as a pre-release, clients
pick it up automatically.

Each `latest.json` contains:
- `version` — used to compare against the installed version.
- `pub_date` — informational.
- `platforms` — per-target signed URL pointing back to the same release's zip.

## Troubleshooting

**"failed to bundle project: optional pre-release identifier in app version
must be numeric-only"** — MSI doesn't accept alphabetic pre-release suffixes.
Use `0.2.7-1` instead of `0.2.7-test`, or drop the suffix entirely.

**"A public key has been found, but no private key"** at the very end of a
local `tauri build`** — harmless for local builds; the updater signing step
only runs in CI where the secret is present.

**Auto-updater not prompting users** — verify the release is published (not
a draft) and not marked as a pre-release. Verify `latest.json` is attached to
the release and its `version` field exceeds the installed version.
