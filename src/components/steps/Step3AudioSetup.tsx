import { useEffect, useState } from "react";
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

  // The user must pick a real mic — never "system default". If nothing is
  // selected yet (first run, or the previously-chosen device disappeared),
  // auto-pick the first non-virtual input so they have a valid choice
  // immediately. They can change it via the dropdown, but they can never
  // pick a meaningless "default" option.
  const realInputs = inputDevices.filter((d) => !isVirtualInput(d));
  useEffect(() => {
    if (realInputs.length === 0) return;
    const isStillValid = selectedInputDevice
      && realInputs.some((d) => d.internal_name === selectedInputDevice);
    if (!isStillValid) {
      onInputDeviceChange(realInputs[0].internal_name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputDevices, selectedInputDevice]);

  const virtualOutputStatus = getVirtualOutputStatus(outputDevices, selectedOutputDevice, currentOS);

  return (
    <WizardLayout
      currentStep={3}
      totalSteps={4}
      stepLabels={["Keyer", "Virtual audio", "Audio", "Video app"]}
      title="Pick your audio devices"
      onBack={onBack}
      onNext={onNext}
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
