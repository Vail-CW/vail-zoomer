import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WizardLayout } from "../wizard/WizardLayout";
import { InfoBox } from "../shared/InfoBox";
import { AudioDiagnosticsModal } from "./AudioDiagnosticsModal";
import {
  MicSection,
  SidetoneRouteButtons,
  LocalOutputPicker,
  VirtualOutputStatusLine,
  isVirtualInput,
  getVirtualOutputStatus,
  DeviceInfo,
  OSType,
} from "../audio";

interface Step3AudioSetupProps {
  inputDevices: DeviceInfo[];
  outputDevices: DeviceInfo[];
  selectedInputDevice: string | null;
  selectedOutputDevice: string | null;
  selectedLocalDevice: string | null;
  sidetoneRoute: string;
  micLevel: number;
  micVolume: number;
  currentOS: OSType;
  onInputDeviceChange: (device: string | null) => void;
  onOutputDeviceChange: (device: string | null) => void;
  onLocalDeviceChange: (device: string | null) => void;
  onSidetoneRouteChange: (route: string) => void;
  onMicVolumeChange: (vol: number) => void;
  onBack: () => void;
  onNext: () => void;
  /** Re-query backend device lists. Called when a dropdown opens so a freshly
      connected Bluetooth/USB device shows up without restarting the app. */
  onRefreshDevices?: () => void;
}

export function Step3AudioSetup({
  inputDevices,
  outputDevices,
  selectedInputDevice,
  selectedOutputDevice,
  selectedLocalDevice,
  sidetoneRoute,
  micLevel,
  micVolume,
  currentOS,
  onInputDeviceChange,
  onLocalDeviceChange,
  onSidetoneRouteChange,
  onMicVolumeChange,
  onBack,
  onNext,
  onRefreshDevices,
}: Step3AudioSetupProps) {
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagText, setDiagText] = useState<string>("");
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);

  const openDiagnostics = async () => {
    setDiagOpen(true);
    setDiagLoading(true);
    setDiagText("");
    try {
      const text = await invoke<string>("dump_linux_audio_diagnostics");
      setDiagText(text);
    } catch (e) {
      setDiagText(`Failed to gather diagnostics: ${e}`);
    } finally {
      setDiagLoading(false);
    }
  };

  const copyDiag = () => {
    navigator.clipboard.writeText(diagText);
    setDiagCopied(true);
    setTimeout(() => setDiagCopied(false), 1500);
  };

  // Check if VailZoomer setup is complete (Linux only)
  const vailZoomerExists = currentOS === "linux" && outputDevices.some(d =>
    d.internal_name === "VailZoomer" ||
    d.display_name.includes("VailZoomer") ||
    d.display_name.includes("Vail Zoomer")
  );
  const needsSetup = currentOS === "linux" && !vailZoomerExists;

  // We intentionally do NOT auto-select a microphone. The user picks their mic
  // explicitly — the picker (which hides virtual devices like VB-Cable) shows
  // "Choose a microphone…" until they do.
  //
  // Gate the "Next" button until a real mic is chosen, so users can't sail past
  // this step with no microphone selected. If the machine genuinely has no mic
  // to pick, we don't trap them here.
  const hasRealMic = inputDevices.some((d) => !isVirtualInput(d));
  const micChosen =
    !!selectedInputDevice &&
    inputDevices.some((d) => d.internal_name === selectedInputDevice && !isVirtualInput(d));
  const needsMicChoice = hasRealMic && !micChosen;

  const virtualOutputStatus = getVirtualOutputStatus(outputDevices, selectedOutputDevice, currentOS);

  return (
    <WizardLayout
      currentStep={3}
      totalSteps={4}
      stepLabels={["Keyer", "Virtual audio", "Audio", "Video app"]}
      title="Pick your audio devices"
      onBack={onBack}
      onNext={onNext}
      nextDisabled={needsMicChoice}
    >
      <div className="max-w-xl mx-auto space-y-4">
        {/* Warning if VailZoomer not set up yet */}
        {needsSetup && micVolume === 0 && (
          <InfoBox variant="warning">
            <p className="text-base">
              <strong>Microphone is muted</strong> to prevent echo. Finish the previous step
              to enable your microphone.
            </p>
          </InfoBox>
        )}

        <MicSection
          label="Which microphone are you talking into?"
          inputDevices={inputDevices}
          selectedInputDevice={selectedInputDevice}
          micLevel={micLevel}
          micVolume={micVolume}
          onInputDeviceChange={onInputDeviceChange}
          onMicVolumeChange={onMicVolumeChange}
          onRefreshDevices={onRefreshDevices}
          onOpenDiagnostics={openDiagnostics}
        />

        {needsMicChoice && (
          <InfoBox variant="warning">
            <p className="text-base">
              <strong>Choose your microphone above</strong> to continue. The “Next” button
              turns on once a microphone is selected.
            </p>
          </InfoBox>
        )}

        <VirtualOutputStatusLine status={virtualOutputStatus} />

        <SidetoneRouteButtons
          route={sidetoneRoute}
          onChange={onSidetoneRouteChange}
          showAdapterMuteHint
        />

        {sidetoneRoute === "Both" && (
          <LocalOutputPicker
            outputDevices={outputDevices}
            selectedLocalDevice={selectedLocalDevice}
            onLocalDeviceChange={onLocalDeviceChange}
            onRefreshDevices={onRefreshDevices}
          />
        )}
      </div>

      {/* Diagnostics modal — last-resort visibility for when a mic doesn't
          appear in the filtered dropdown. Dumps the full system audio state
          (sources, sinks, BT profiles, ALSA, packages) for the user to
          share with the developer. */}
      {diagOpen && (
        <AudioDiagnosticsModal
          diagText={diagText}
          diagLoading={diagLoading}
          diagCopied={diagCopied}
          onCopy={copyDiag}
          onClose={() => setDiagOpen(false)}
        />
      )}
    </WizardLayout>
  );
}
