import { WizardLayout } from "../wizard/WizardLayout";
import { BigSelect } from "../shared/BigSelect";
import { BigButton } from "../shared/BigButton";
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
  onTestTone: () => void;
  onBack: () => void;
  onNext: () => void;
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
  onTestTone,
  onBack,
  onNext,
}: Step3AudioSetupProps) {
  // Check if VailZoomer setup is complete (Linux only)
  const vailZoomerExists = currentOS === "linux" && outputDevices.some(d =>
    d.internal_name === "VailZoomer" ||
    d.display_name.includes("VailZoomer") ||
    d.display_name.includes("Vail Zoomer")
  );
  const needsSetup = currentOS === "linux" && !vailZoomerExists;

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
          <label className="block text-sm text-gray-300">Your microphone:</label>
          <BigSelect
            value={selectedInputDevice || ""}
            onChange={(v) => onInputDeviceChange(v || null)}
            options={inputDevices
              .filter((d) => !d.internal_name.toLowerCase().includes("vailzoomer") && !d.display_name.toLowerCase().includes("vail zoomer"))
              .map((d) => ({
                value: d.internal_name,
                label: d.display_name,
              }))}
            placeholder="System Default"
          />

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
                To disable the Vail adapter's built-in buzzer, turn the volume knob fully counter-clockwise until it clicks off.
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
              options={outputDevices
                .filter((d) => !d.internal_name.toLowerCase().includes("vailzoomer") && !d.display_name.toLowerCase().includes("vail zoomer"))
                .map((d) => ({
                  value: d.internal_name,
                  label: d.display_name,
                }))}
              placeholder="System Default"
            />
          </div>
        )}

        {/* Test button */}
        <div className="text-center pt-1">
          <BigButton variant="secondary" onClick={onTestTone} className="!min-h-[40px] !py-2 !px-6 !text-sm">
            Test Tone
          </BigButton>
          <p className="text-xs text-gray-500 mt-1">
            {sidetoneRoute === "OutputOnly"
              ? "(Sound plays on Vail adapter speaker only)"
              : "(Sound plays on both adapter and computer speakers)"}
          </p>
        </div>

      </div>
    </WizardLayout>
  );
}
