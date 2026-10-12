import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WizardLayout } from "../wizard/WizardLayout";
import { Callout } from "../shared/Callout";
import { Card } from "../shared/Card";
import { AudioDiagnosticsModal } from "./AudioDiagnosticsModal";
import {
  MicSection,
  SidetoneRouteButtons,
  LocalOutputPicker,
  VirtualOutputRow,
  isVirtualInput,
  DeviceInfo,
  OSType,
} from "../audio";

interface Step3AudioSetupProps {
  inputDevices: DeviceInfo[];
  outputDevices: DeviceInfo[];
  selectedInputDevice: string | null;
  selectedLocalDevice: string | null;
  sidetoneRoute: string;
  micLevel: number;
  micVolume: number;
  currentOS: OSType;
  onInputDeviceChange: (device: string | null) => void;
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

  // We intentionally do NOT auto-select a microphone. The user picks it
  // explicitly; the picker hides virtual devices like VB-Cable.
  //
  // Gate "Next" until a real mic is chosen so users cannot sail past this
  // step with no microphone. If the machine genuinely has no mic, we do not
  // trap them here.
  const hasRealMic = inputDevices.some((d) => !isVirtualInput(d));
  const micChosen =
    !!selectedInputDevice &&
    inputDevices.some((d) => d.internal_name === selectedInputDevice && !isVirtualInput(d));
  const needsMicChoice = hasRealMic && !micChosen;

  return (
    <WizardLayout
      currentStep={3}
      totalSteps={4}
      stepLabels={["Keyer", "Virtual audio", "Audio", "Video app"]}
      title="Audio devices"
      subtitle="Pick your microphone and where you hear the sidetone."
      onBack={onBack}
      onNext={onNext}
      nextDisabled={needsMicChoice}
    >
      <VirtualOutputRow outputDevices={outputDevices} currentOS={currentOS} onSetup={onBack} />

      <Card>
        <MicSection
          label="Microphone"
          inputDevices={inputDevices}
          selectedInputDevice={selectedInputDevice}
          micLevel={micLevel}
          micVolume={micVolume}
          onInputDeviceChange={onInputDeviceChange}
          onMicVolumeChange={onMicVolumeChange}
          onRefreshDevices={onRefreshDevices}
          onOpenDiagnostics={openDiagnostics}
        />
        {needsMicChoice && <p className="mt-2 text-sm text-warn-fg">Choose a microphone to continue.</p>}
        {micVolume === 0 && !needsMicChoice && (
          <p className="mt-2 text-sm text-warn-fg">Your mic is muted. Drag the slider to unmute.</p>
        )}
      </Card>

      <Card>
        <div className="space-y-3">
          <SidetoneRouteButtons route={sidetoneRoute} onChange={onSidetoneRouteChange} showAdapterMuteHint />
          {sidetoneRoute === "Both" && (
            <LocalOutputPicker
              outputDevices={outputDevices}
              selectedLocalDevice={selectedLocalDevice}
              onLocalDeviceChange={onLocalDeviceChange}
              onRefreshDevices={onRefreshDevices}
            />
          )}
        </div>
      </Card>

      {currentOS === "linux" && (
        <Callout tone="info">If a device is missing, use "Don't see your microphone?" to copy diagnostics.</Callout>
      )}

      {/* Diagnostics: last-resort visibility for when a mic does not appear in
          the filtered dropdown. */}
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
