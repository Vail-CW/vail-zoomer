; Vail Zoomer NSIS hooks
;
; VB-Cable is donationware by VB-Audio Software (https://vb-audio.com/Cable/),
; bundled with attribution per VB-Audio licensing terms.
;
; The installer intentionally does NOT touch the audio driver. Installing a
; kernel-mode driver during setup trips antivirus / HIPS / folder-protection
; tools and is the kind of behavior that gets the whole installer flagged.
; Instead, VB-Cable is installed on demand from inside the app via an explicit,
; user-initiated button (the `install_vbcable` command), which launches the
; bundled installer with a normal UAC elevation prompt.
;
; This hook is left as an intentional no-op so the installerHooks reference in
; tauri.conf.json stays valid.

!macro NSIS_HOOK_POSTINSTALL
!macroend
