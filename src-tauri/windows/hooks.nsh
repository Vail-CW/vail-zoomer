; VB-Cable Installation Hook for Vail Zoomer
; VB-Cable is donationware by VB-Audio Software (https://vb-audio.com/Cable/)
; Bundled with attribution per VB-Audio licensing terms

!macro NSIS_HOOK_POSTINSTALL
  ; Check if VB-Cable is already installed by looking for the device
  nsExec::ExecToStack 'powershell -Command "Get-PnpDevice -FriendlyName ''*VB-Audio*'' -ErrorAction SilentlyContinue"'
  Pop $0
  Pop $1

  ; If VB-Cable is found, skip the prompt
  StrCmp $1 "" 0 vbcable_found

  ; Show message about VB-Cable - prompt user to install manually
  MessageBox MB_YESNO|MB_ICONQUESTION "Vail Zoomer requires VB-Cable virtual audio driver to send audio to video conferencing apps.$\n$\nVB-Cable is free donationware by VB-Audio Software (vb-audio.com/Cable).$\nIf you find it useful, please consider donating!$\n$\nWould you like to open the VB-Cable installer now?$\n(You will need to run it as Administrator)" IDYES open_vbcable IDNO skip_vbcable

  open_vbcable:
    DetailPrint "Opening VB-Cable installer folder..."

    ; Open Explorer to the VBCABLE folder so user can run installer
    ${If} ${RunningX64}
      Exec 'explorer.exe /select,"$INSTDIR\resources\VBCABLE\VBCABLE_Setup_x64.exe"'
    ${Else}
      Exec 'explorer.exe /select,"$INSTDIR\resources\VBCABLE\VBCABLE_Setup.exe"'
    ${EndIf}

    MessageBox MB_OK|MB_ICONINFORMATION "The VB-Cable folder has been opened.$\n$\nTo install:$\n1. Right-click on VBCABLE_Setup_x64.exe$\n2. Select 'Run as administrator'$\n3. Click 'Install Driver'$\n4. Restart your computer$\n$\nVB-Cable is donationware - please consider supporting VB-Audio at vb-audio.com/Cable"
    Goto vbcable_done

  vbcable_found:
    DetailPrint "VB-Cable is already installed"
    Goto vbcable_done

  skip_vbcable:
    DetailPrint "VB-Cable installation skipped by user"
    MessageBox MB_OK|MB_ICONINFORMATION "You can install VB-Cable later by:$\n$\n1. Navigate to: $INSTDIR\resources\VBCABLE\$\n2. Right-click VBCABLE_Setup_x64.exe$\n3. Select 'Run as administrator'$\n$\nOr download from vb-audio.com/Cable$\n$\nVB-Cable is donationware - please consider supporting VB-Audio!"

  vbcable_done:
!macroend
