import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WizardLayout } from "../wizard/WizardLayout";
import { BigSelect } from "../shared/BigSelect";
import { InfoBox } from "../shared/InfoBox";

interface DeviceInfo {
  display_name: string;
  internal_name: string;
}

interface Step3AudioSetupProps {
  inputDevices: DeviceInfo[];
  outputDevices: DeviceInfo[];
  selectedInputDevice: string | null;
  selectedOutputDevice: string | null;
  selectedLocalDevice: string | null;
  sidetoneRoute: string;
  micLevel: number;
  micVolume: number;
  currentOS: "windows" | "macos" | "linux";
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
  const [refreshSpin, setRefreshSpin] = useState(false);

  const handleRefresh = async () => {
    if (!onRefreshDevices) return;
    setRefreshSpin(true);
    try {
      await Promise.resolve(onRefreshDevices());
    } finally {
      setTimeout(() => setRefreshSpin(false), 400);
    }
  };

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
  // Filter out virtual audio devices that users should never select directly
  const isVirtualDevice = (d: DeviceInfo) => {
    const iname = d.internal_name.toLowerCase();
    const dname = d.display_name.toLowerCase();
    return iname.includes("vailzoomer") || dname.includes("vail zoomer")
      || iname.includes("blackhole") || dname.includes("blackhole");
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
  const realInputs = inputDevices.filter((d) => !isVirtualDevice(d));
  useEffect(() => {
    if (realInputs.length === 0) return;
    const isStillValid = selectedInputDevice
      && realInputs.some((d) => d.internal_name === selectedInputDevice);
    if (!isStillValid) {
      onInputDeviceChange(realInputs[0].internal_name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputDevices, selectedInputDevice]);

  // Compact BlackHole/VBCable status line for non-Linux platforms
  const virtualOutputStatus = (() => {
    if (currentOS === "macos") {
      const has = outputDevices.some(d =>
        d.internal_name.toLowerCase().includes("blackhole") ||
        d.display_name.toLowerCase().includes("blackhole")
      );
      const selected = selectedOutputDevice?.toLowerCase().includes("blackhole");
      if (!has) return { kind: "warn" as const, text: "BlackHole isn't installed — go back to Step 2." };
      if (!selected) return { kind: "warn" as const, text: "BlackHole found but not selected — restart the app." };
      return { kind: "ok" as const, text: "BlackHole is routing morse to Zoom." };
    }
    if (currentOS === "windows") {
      const has = outputDevices.some(d => {
        const i = d.internal_name.toLowerCase();
        const n = d.display_name.toLowerCase();
        return i.includes("cable") || n.includes("cable") || i.includes("vb-audio") || n.includes("vb-audio");
      });
      const selected = selectedOutputDevice?.toLowerCase().includes("cable")
        || selectedOutputDevice?.toLowerCase().includes("vb-audio");
      if (!has) return { kind: "warn" as const, text: "VB-Cable isn't installed — go back to Step 2." };
      if (!selected) return { kind: "warn" as const, text: "VB-Cable found but not selected — restart the app." };
      return { kind: "ok" as const, text: "VB-Cable is routing morse to Zoom." };
    }
    return null;
  })();

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

        {/* Microphone selection with level meter and volume control */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-lg text-gray-200 font-medium">
              Which microphone are you talking into?
            </label>
            {onRefreshDevices && (
              <button
                onClick={handleRefresh}
                title="Re-scan connected microphones"
                className="min-h-[44px] text-base text-gray-300 hover:text-amber-300 flex items-center gap-1 px-3 py-1 rounded hover:bg-gray-800"
              >
                <span className={refreshSpin ? "inline-block animate-spin" : "inline-block"}>↻</span>
                Refresh
              </button>
            )}
          </div>
          <BigSelect
            value={selectedInputDevice && realInputs.some((d) => d.internal_name === selectedInputDevice)
              ? selectedInputDevice
              : ""}
            onChange={(v) => v && onInputDeviceChange(v)}
            onOpen={onRefreshDevices}
            options={realInputs.map((d) => ({
              value: d.internal_name,
              label: d.display_name,
            }))}
            placeholder={realInputs.length === 0 ? "No microphones detected" : "Choose a microphone…"}
          />
          <button
            onClick={openDiagnostics}
            className="min-h-[44px] text-base text-gray-300 hover:text-amber-300 underline"
          >
            Don't see your microphone?
          </button>

          {/* Mic volume slider with mute indicator */}
          <div className="flex items-center gap-3">
            <span className="text-base text-gray-200 w-24">
              {micVolume === 0 ? (
                <span className="text-amber-400 font-medium">Muted</span>
              ) : (
                `${Math.round(micVolume * 100)}%`
              )}
            </span>
            <input
              type="range"
              min="0"
              max="150"
              value={Math.round(micVolume * 100)}
              onChange={(e) => onMicVolumeChange(parseInt(e.target.value) / 100)}
              className="flex-1"
              aria-label="Microphone volume"
            />
          </div>

          {/* Level meter */}
          <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                micLevel > 0.8 ? "bg-red-500" : micLevel > 0.5 ? "bg-yellow-500" : "bg-green-500"
              }`}
              style={{ width: `${Math.min(micLevel * 100, 100)}%` }}
            />
          </div>

          {micVolume === 0 && (
            <p className="text-base text-amber-300">
              Drag the slider to unmute and adjust your microphone volume.
            </p>
          )}
        </div>

        {/* Mac/Windows virtual cable status — one line, no extra card */}
        {virtualOutputStatus && (
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${
              virtualOutputStatus.kind === "ok"
                ? "bg-green-900/30 border-green-700"
                : "bg-yellow-900/30 border-yellow-700"
            }`}
          >
            <span
              className={`text-2xl leading-none ${
                virtualOutputStatus.kind === "ok" ? "text-green-400" : "text-yellow-400"
              }`}
            >
              {virtualOutputStatus.kind === "ok" ? "✓" : "!"}
            </span>
            <p className="text-base text-gray-100">{virtualOutputStatus.text}</p>
          </div>
        )}

        {/* Sidetone routing */}
        <div className="space-y-2">
          <label className="block text-lg text-gray-200 font-medium">
            Where do you want to hear the morse tones?
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSidetoneRouteChange("OutputOnly")}
              className={`p-4 text-center rounded-xl border-2 transition-colors min-h-[72px] ${
                sidetoneRoute === "OutputOnly"
                  ? "bg-amber-500/15 border-amber-400"
                  : "bg-gray-800 border-gray-600 hover:border-gray-500"
              }`}
            >
              <div className="text-base font-medium">Adapter only</div>
              <div className="text-sm text-gray-300 mt-1">Built-in speaker</div>
            </button>
            <button
              onClick={() => onSidetoneRouteChange("Both")}
              className={`p-4 text-center rounded-xl border-2 transition-colors min-h-[72px] ${
                sidetoneRoute === "Both"
                  ? "bg-amber-500/15 border-amber-400"
                  : "bg-gray-800 border-gray-600 hover:border-gray-500"
              }`}
            >
              <div className="text-base font-medium">Adapter + computer</div>
              <div className="text-sm text-gray-300 mt-1">Both speakers</div>
            </button>
          </div>
          {sidetoneRoute === "OutputOnly" && (
            <p className="text-sm text-gray-300 pt-1">
              To mute the Vail Adapter's built-in speaker, hold the dit paddle down for
              10 seconds. Power-cycle the adapter to restore it.
            </p>
          )}
        </div>

        {/* Local output device - show if using local sidetone */}
        {sidetoneRoute === "Both" && (
          <div className="space-y-1">
            <label className="block text-lg text-gray-200 font-medium">
              Your speakers / headphones
            </label>
            <BigSelect
              value={selectedLocalDevice || ""}
              onChange={(v) => onLocalDeviceChange(v || null)}
              onOpen={onRefreshDevices}
              options={outputDevices
                .filter((d) => !isVirtualDevice(d))
                .map((d) => ({
                  value: d.internal_name,
                  label: d.display_name,
                }))}
              placeholder="System default"
            />
          </div>
        )}

      </div>

      {/* Diagnostics modal — last-resort visibility for when a mic doesn't
          appear in the filtered dropdown. Dumps the full system audio state
          (sources, sinks, BT profiles, ALSA, packages) for the user to
          share with the developer. */}
      {diagOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-amber-400">Audio diagnostics</h2>
                <p className="text-base text-gray-200 mt-0.5">
                  Snapshot of every audio device on this system — including ones Vail Zoomer
                  hides. If your mic is missing here, copy this and share with the developers.
                </p>
              </div>
              <button
                onClick={() => setDiagOpen(false)}
                className="min-h-[44px] min-w-[44px] text-gray-300 hover:text-white text-3xl leading-none"
                aria-label="Close diagnostics"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {diagLoading ? (
                <p className="text-base text-gray-300">Collecting…</p>
              ) : (
                <pre className="text-sm text-gray-200 font-mono whitespace-pre-wrap">{diagText}</pre>
              )}
            </div>
            <div className="p-3 border-t border-gray-700 flex items-center justify-end gap-2">
              <button
                onClick={() => setDiagOpen(false)}
                className="min-h-[44px] px-4 text-base bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg"
              >
                Close
              </button>
              <button
                onClick={copyDiag}
                disabled={diagLoading || !diagText}
                className="min-h-[44px] px-4 text-base bg-amber-600 hover:bg-amber-500 text-white rounded-lg disabled:opacity-50"
              >
                {diagCopied ? "Copied" : "Copy for developer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </WizardLayout>
  );
}
