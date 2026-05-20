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

  return (
    <WizardLayout
      currentStep={3}
      totalSteps={4}
      stepLabels={["Vail Adapter", "Virtual Audio", "Audio", "Video App"]}
      title="Audio Setup"
      onBack={onBack}
      onNext={onNext}
    >
      <div className="max-w-xl mx-auto space-y-3">
        {/* Warning if VailZoomer not set up yet */}
        {needsSetup && micVolume === 0 && (
          <InfoBox variant="warning">
            <p className="text-sm">
              <strong>Microphone is muted</strong> to prevent echo. Complete the Virtual Audio setup (previous step) to enable your microphone.
            </p>
          </InfoBox>
        )}

        {/* Important reminder */}
        <InfoBox variant="info">
          <p className="text-sm">
            <strong>Don't change your computer's sound settings.</strong> Just choose devices here and in Zoom.
          </p>
        </InfoBox>

        {/* Microphone selection with level meter and volume control */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm text-gray-300">Your microphone:</label>
            {onRefreshDevices && (
              <button
                onClick={handleRefresh}
                title="Re-scan connected microphones"
                className="text-xs text-gray-400 hover:text-amber-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-800"
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
            className="text-xs text-gray-500 hover:text-amber-300 underline"
          >
            Don't see your microphone?
          </button>

          {/* Mic volume slider with mute indicator */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 w-20">
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
            />
          </div>

          {/* Level meter */}
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                micLevel > 0.8 ? "bg-red-500" : micLevel > 0.5 ? "bg-yellow-500" : "bg-green-500"
              }`}
              style={{ width: `${Math.min(micLevel * 100, 100)}%` }}
            />
          </div>

          {micVolume === 0 && (
            <p className="text-xs text-amber-400">
              Drag the slider to unmute and adjust your microphone volume
            </p>
          )}
        </div>

        {/* BlackHole status on macOS */}
        {currentOS === "macos" && (() => {
          const hasBlackHole = outputDevices.some(d =>
            d.internal_name.toLowerCase().includes("blackhole") ||
            d.display_name.toLowerCase().includes("blackhole")
          );
          const blackHoleSelected = selectedOutputDevice?.toLowerCase().includes("blackhole");
          if (!hasBlackHole) {
            return (
              <InfoBox variant="warning" title="BlackHole not detected">
                <p className="text-sm">
                  BlackHole 2ch is required to send morse tones to Zoom.
                  Go back to Step 2 to install it, then restart the app.
                </p>
              </InfoBox>
            );
          }
          if (!blackHoleSelected) {
            return (
              <InfoBox variant="warning" title="BlackHole not active">
                <p className="text-sm">
                  BlackHole was found but isn't set as the output device.
                  Restart the app to auto-configure it.
                </p>
              </InfoBox>
            );
          }
          return (
            <InfoBox variant="success" title="BlackHole active">
              <p className="text-sm">
                Audio is routed through BlackHole to Zoom.
              </p>
            </InfoBox>
          );
        })()}

        {/* Sidetone routing - simplified to match Windows version */}
        <div className="space-y-2">
          <label className="block text-sm text-gray-300">Where do you want to hear morse tones?</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSidetoneRouteChange("OutputOnly")}
              className={`p-3 text-center rounded-lg border-2 transition-colors ${
                sidetoneRoute === "OutputOnly"
                  ? "bg-amber-500/20 border-amber-500"
                  : "bg-gray-800 border-gray-600 hover:border-gray-500"
              }`}
            >
              <div className="text-sm font-medium">Vail Adapter Only</div>
              <div className="text-xs text-gray-400 mt-1">Built-in speaker</div>
            </button>
            <button
              onClick={() => onSidetoneRouteChange("Both")}
              className={`p-3 text-center rounded-lg border-2 transition-colors ${
                sidetoneRoute === "Both"
                  ? "bg-amber-500/20 border-amber-500"
                  : "bg-gray-800 border-gray-600 hover:border-gray-500"
              }`}
            >
              <div className="text-sm font-medium">Adapter + Computer</div>
              <div className="text-xs text-gray-400 mt-1">Both speakers</div>
            </button>
          </div>
          {sidetoneRoute === "OutputOnly" && (
            <InfoBox variant="info">
              <p className="text-xs">
                To mute the Vail adapter's built-in speaker, hold the dit paddle down for 10 seconds. Power cycle the adapter to restore it.
              </p>
            </InfoBox>
          )}
        </div>

        {/* Local output device - show if using local sidetone */}
        {sidetoneRoute === "Both" && (
          <div className="space-y-1">
            <label className="block text-sm text-gray-300">Your speakers/headphones:</label>
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
              placeholder="System Default"
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
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-amber-400">Audio diagnostics</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Full snapshot of every audio device the system can see — including ones
                  Vail Zoomer hides. If your mic is missing here, copy this and share with the developers.
                </p>
              </div>
              <button
                onClick={() => setDiagOpen(false)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {diagLoading ? (
                <p className="text-sm text-gray-400">Collecting…</p>
              ) : (
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">{diagText}</pre>
              )}
            </div>
            <div className="p-3 border-t border-gray-700 flex items-center justify-end gap-2">
              <button
                onClick={() => setDiagOpen(false)}
                className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg"
              >
                Close
              </button>
              <button
                onClick={copyDiag}
                disabled={diagLoading || !diagText}
                className="px-3 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg disabled:opacity-50"
              >
                {diagCopied ? "Copied!" : "Copy for developer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </WizardLayout>
  );
}
