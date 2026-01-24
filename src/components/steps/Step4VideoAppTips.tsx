import { useState } from "react";
import { WizardLayout } from "../wizard/WizardLayout";
import { InfoBox } from "../shared/InfoBox";
import { CollapsibleSection } from "../shared/CollapsibleSection";

interface Step4VideoAppTipsProps {
  onBack: () => void;
  onComplete: () => void;
  currentOS: "windows" | "macos" | "linux";
}

export function Step4VideoAppTips({
  onBack,
  onComplete,
  currentOS,
}: Step4VideoAppTipsProps) {
  const [selectedApp, setSelectedApp] = useState<"zoom" | "teams" | "discord" | "meet">("zoom");

  const getVirtualDeviceName = () => {
    switch (currentOS) {
      case "macos":
        return "BlackHole 2ch";
      case "linux":
        return "VailZoomer Mic";
      default:
        return "CABLE Output";
    }
  };

  const virtualDevice = getVirtualDeviceName();

  return (
    <WizardLayout
      currentStep={4}
      totalSteps={4}
      stepLabels={["Vail Adapter", "Virtual Audio", "Audio", "Video App"]}
      title="Video App Setup"
      onBack={onBack}
      onNext={onComplete}
      nextLabel="Finish Setup"
    >
      <div className="max-w-xl mx-auto space-y-3">
        {/* App selector tabs */}
        <div className="flex gap-1 justify-center">
          {[
            { id: "zoom", label: "Zoom" },
            { id: "teams", label: "Teams" },
            { id: "discord", label: "Discord" },
            { id: "meet", label: "Meet" },
          ].map((app) => (
            <button
              key={app.id}
              onClick={() => setSelectedApp(app.id as typeof selectedApp)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                selectedApp === app.id
                  ? "bg-amber-500 text-gray-900"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {app.label}
            </button>
          ))}
        </div>

        {/* Zoom instructions */}
        {selectedApp === "zoom" && (
          <div className="space-y-3">
            <InfoBox variant="warning" title="Zoom Settings">
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Settings → Audio → Microphone: <code className="bg-gray-800 px-1 rounded">{virtualDevice}</code></li>
                <li>Turn <span className="text-red-400">OFF</span> "Automatically adjust volume"</li>
                <li>Settings → Audio → Microphone modes → Select <span className="text-green-400">"Original sound for musicians"</span></li>
                <li>Turn <span className="text-red-400">OFF</span> "High-fidelity music mode"</li>
                <li>Turn <span className="text-red-400">OFF</span> noise suppression and echo cancellation</li>
              </ol>
            </InfoBox>

            <InfoBox variant="info" title="Zoom Test Mic">
              <p className="text-sm">
                "High-fidelity music mode" must be <span className="text-red-400">OFF</span> or
                Zoom's Test Mic won't work properly. Morse tones <strong className="text-green-400">will work</strong> in actual calls.
              </p>
            </InfoBox>
          </div>
        )}

        {/* Teams instructions */}
        {selectedApp === "teams" && (
          <InfoBox variant="warning" title="Teams Settings">
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>Profile → Settings → Devices</li>
              <li>Microphone: <code className="bg-gray-800 px-1 rounded">{virtualDevice}</code></li>
              <li>Turn <span className="text-red-400">OFF</span> noise suppression</li>
            </ol>
          </InfoBox>
        )}

        {/* Discord instructions */}
        {selectedApp === "discord" && (
          <InfoBox variant="warning" title="Discord Settings">
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>User Settings → Voice & Video</li>
              <li>Input Device: <code className="bg-gray-800 px-1 rounded">{virtualDevice}</code></li>
              <li>Turn <span className="text-red-400">OFF</span> auto input sensitivity</li>
              <li>Turn <span className="text-red-400">OFF</span> Echo Cancellation, Noise Suppression, Auto Gain</li>
            </ol>
          </InfoBox>
        )}

        {/* Google Meet instructions */}
        {selectedApp === "meet" && (
          <InfoBox variant="warning" title="Google Meet Settings">
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>In a meeting: ⋮ → Settings → Audio</li>
              <li>Microphone: <code className="bg-gray-800 px-1 rounded">{virtualDevice}</code></li>
            </ol>
          </InfoBox>
        )}

        {/* Virtual audio help */}
        <CollapsibleSection title="Need virtual audio help?">
          <div className="text-sm text-gray-300 space-y-2">
            {currentOS === "windows" && (
              <p>
                Install <strong>VB-Cable</strong> from{" "}
                <a href="https://vb-audio.com/Cable/" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">
                  vb-audio.com/Cable
                </a>
                {" "}and restart your computer.
              </p>
            )}
            {currentOS === "macos" && (
              <p>
                Install <strong>BlackHole</strong> from{" "}
                <a href="https://existential.audio/blackhole/" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">
                  existential.audio/blackhole
                </a>
              </p>
            )}
            {currentOS === "linux" && (
              <p>Use the Setup Virtual Audio button on the main screen.</p>
            )}
          </div>
        </CollapsibleSection>
      </div>
    </WizardLayout>
  );
}
