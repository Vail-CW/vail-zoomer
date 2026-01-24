import { WizardLayout } from "../wizard/WizardLayout";
import { BigSelect } from "../shared/BigSelect";
import { BigButton } from "../shared/BigButton";
import { InfoBox } from "../shared/InfoBox";
import { CollapsibleSection } from "../shared/CollapsibleSection";

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
  currentOS: "windows" | "macos" | "linux";
  onInputDeviceChange: (device: string | null) => void;
  onOutputDeviceChange: (device: string | null) => void;
  onLocalDeviceChange: (device: string | null) => void;
  onSidetoneRouteChange: (route: string) => void;
  onTestTone: () => void;
  onBack: () => void;
  onNext: () => void;
}

export function Step3AudioSetup({
  inputDevices,
  outputDevices,
  selectedInputDevice,
  selectedOutputDevice,
  selectedLocalDevice,
  sidetoneRoute,
  micLevel,
  currentOS,
  onInputDeviceChange,
  onOutputDeviceChange,
  onLocalDeviceChange,
  onSidetoneRouteChange,
  onTestTone,
  onBack,
  onNext,
}: Step3AudioSetupProps) {
  const getVirtualDeviceName = () => {
    switch (currentOS) {
      case "macos":
        return "BlackHole 2ch";
      case "linux":
        return "Vail Zoomer";
      default:
        return "CABLE Input";
    }
  };

  const virtualDeviceName = getVirtualDeviceName();

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
        {/* Important reminder */}
        <InfoBox variant="info">
          <p className="text-sm">
            <strong>Don't change your computer's sound settings.</strong> Just choose devices here and in Zoom.
          </p>
        </InfoBox>

        {/* Microphone selection with level meter */}
        <div className="space-y-1">
          <label className="block text-sm text-gray-300">Your microphone:</label>
          <BigSelect
            value={selectedInputDevice || ""}
            onChange={(v) => onInputDeviceChange(v || null)}
            options={inputDevices.map((d) => ({
              value: d.internal_name,
              label: d.display_name,
            }))}
            placeholder="System Default"
          />
          <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                micLevel > 0.8 ? "bg-red-500" : micLevel > 0.5 ? "bg-yellow-500" : "bg-green-500"
              }`}
              style={{ width: `${Math.min(micLevel * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Output device selection */}
        <div className="space-y-1">
          <label className="block text-sm text-gray-300">
            Output to Zoom (select <strong className="text-amber-400">{virtualDeviceName}</strong>):
          </label>
          <BigSelect
            value={selectedOutputDevice || ""}
            onChange={(v) => onOutputDeviceChange(v || null)}
            options={outputDevices.map((d) => ({
              value: d.internal_name,
              label: d.display_name,
            }))}
            placeholder="System Default"
          />
        </div>

        {/* Sidetone routing - compact */}
        <div className="space-y-2">
          <label className="block text-sm text-gray-300">How do you want to hear morse tones?</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onSidetoneRouteChange("OutputOnly")}
              className={`p-2 text-center rounded-lg border-2 transition-colors ${
                sidetoneRoute === "OutputOnly"
                  ? "bg-amber-500/20 border-amber-500"
                  : "bg-gray-800 border-gray-600 hover:border-gray-500"
              }`}
            >
              <div className="text-sm font-medium">Vail speaker</div>
              <div className="text-xs text-gray-400">No computer sound</div>
            </button>
            <button
              onClick={() => onSidetoneRouteChange("LocalOnly")}
              className={`p-2 text-center rounded-lg border-2 transition-colors ${
                sidetoneRoute === "LocalOnly"
                  ? "bg-amber-500/20 border-amber-500"
                  : "bg-gray-800 border-gray-600 hover:border-gray-500"
              }`}
            >
              <div className="text-sm font-medium">Computer</div>
              <div className="text-xs text-gray-400">Speakers/headphones</div>
            </button>
            <button
              onClick={() => onSidetoneRouteChange("Both")}
              className={`p-2 text-center rounded-lg border-2 transition-colors ${
                sidetoneRoute === "Both"
                  ? "bg-amber-500/20 border-amber-500"
                  : "bg-gray-800 border-gray-600 hover:border-gray-500"
              }`}
            >
              <div className="text-sm font-medium">Both</div>
              <div className="text-xs text-gray-400">Vail + computer</div>
            </button>
          </div>
        </div>

        {/* Local output device - show if using local sidetone */}
        {(sidetoneRoute === "LocalOnly" || sidetoneRoute === "Both") && (
          <div className="space-y-1">
            <label className="block text-sm text-gray-300">Your speakers/headphones:</label>
            <BigSelect
              value={selectedLocalDevice || ""}
              onChange={(v) => onLocalDeviceChange(v || null)}
              options={outputDevices.map((d) => ({
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
          {sidetoneRoute === "OutputOnly" && (
            <p className="text-xs text-gray-500 mt-1">
              (Sound goes to Vail adapter speaker, not your computer)
            </p>
          )}
        </div>

        {/* Volume controls - collapsed */}
        <CollapsibleSection title="Adjust volumes" defaultOpen={false}>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-sm text-gray-300">Mic volume</label>
              <input type="range" min="0" max="150" defaultValue="100" className="w-full" />
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </WizardLayout>
  );
}
