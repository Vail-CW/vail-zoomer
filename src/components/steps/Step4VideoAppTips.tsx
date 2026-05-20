import { useEffect, useState } from "react";
import { WizardLayout } from "../wizard/WizardLayout";
import { InfoBox } from "../shared/InfoBox";
import { CollapsibleSection } from "../shared/CollapsibleSection";

interface Step4VideoAppTipsProps {
  onBack: () => void;
  onComplete: () => void;
  currentOS: "windows" | "macos" | "linux";
}

type VideoApp = "zoom" | "teams" | "discord" | "meet";

const VIDEO_APP_STORAGE_KEY = "vail-zoomer-last-video-app";

export function Step4VideoAppTips({
  onBack,
  onComplete,
  currentOS,
}: Step4VideoAppTipsProps) {
  const [selectedApp, setSelectedApp] = useState<VideoApp>(() => {
    const saved = localStorage.getItem(VIDEO_APP_STORAGE_KEY);
    if (saved === "zoom" || saved === "teams" || saved === "discord" || saved === "meet") {
      return saved;
    }
    return "zoom";
  });

  useEffect(() => {
    localStorage.setItem(VIDEO_APP_STORAGE_KEY, selectedApp);
  }, [selectedApp]);

  const getVirtualDeviceName = () => {
    switch (currentOS) {
      case "macos":
        return "BlackHole 2ch";
      case "linux":
        return "Vail Zoomer Microphone";
      default:
        return "CABLE Output (VB-Audio Virtual Cable)";
    }
  };

  const virtualDevice = getVirtualDeviceName();

  return (
    <WizardLayout
      currentStep={4}
      totalSteps={4}
      stepLabels={["Keyer", "Virtual audio", "Audio", "Video app"]}
      title="Set up your video app"
      onBack={onBack}
      onNext={onComplete}
      nextLabel="Finish setup"
    >
      <div className="max-w-xl mx-auto space-y-4">
        {/* App selector tabs */}
        <div className="flex gap-2 justify-center flex-wrap">
          {[
            { id: "zoom", label: "Zoom" },
            { id: "teams", label: "Teams" },
            { id: "discord", label: "Discord" },
            { id: "meet", label: "Meet" },
          ].map((app) => (
            <button
              key={app.id}
              onClick={() => setSelectedApp(app.id as VideoApp)}
              className={`min-h-[48px] px-5 py-2 text-base font-medium rounded-xl transition-colors ${
                selectedApp === app.id
                  ? "bg-amber-500 text-gray-900"
                  : "bg-gray-700 text-gray-200 hover:bg-gray-600"
              }`}
            >
              {app.label}
            </button>
          ))}
        </div>

        {selectedApp === "zoom" && (
          <div className="space-y-3">
            <InfoBox variant="warning" title="Zoom settings">
              <ol className="list-decimal list-inside space-y-1 text-base">
                <li>
                  Settings → Audio → Microphone:{" "}
                  <code className="bg-gray-800 px-1 rounded">{virtualDevice}</code>
                </li>
                <li>Turn <span className="text-red-400 font-medium">OFF</span> "Automatically adjust volume"</li>
                <li>
                  Settings → Audio → Microphone modes → pick{" "}
                  <span className="text-green-300 font-medium">"Original sound for musicians"</span>
                </li>
                <li>Turn <span className="text-red-400 font-medium">OFF</span> "High-fidelity music mode"</li>
                <li>Turn <span className="text-red-400 font-medium">OFF</span> noise suppression and echo cancellation</li>
              </ol>
            </InfoBox>

            <InfoBox variant="info" title="One Zoom quirk">
              <p className="text-base">
                "High-fidelity music mode" must be <span className="text-red-300">OFF</span> or
                Zoom's Test Mic won't pick up the tones. They <strong className="text-green-300">do work</strong> in
                an actual call.
              </p>
            </InfoBox>
          </div>
        )}

        {selectedApp === "teams" && (
          <InfoBox variant="warning" title="Teams settings">
            <ol className="list-decimal list-inside space-y-1 text-base">
              <li>Profile → Settings → Devices</li>
              <li>Microphone: <code className="bg-gray-800 px-1 rounded">{virtualDevice}</code></li>
              <li>Turn <span className="text-red-400 font-medium">OFF</span> noise suppression</li>
            </ol>
          </InfoBox>
        )}

        {selectedApp === "discord" && (
          <InfoBox variant="warning" title="Discord settings">
            <ol className="list-decimal list-inside space-y-1 text-base">
              <li>User Settings → Voice &amp; Video</li>
              <li>Input Device: <code className="bg-gray-800 px-1 rounded">{virtualDevice}</code></li>
              <li>Turn <span className="text-red-400 font-medium">OFF</span> auto input sensitivity</li>
              <li>Turn <span className="text-red-400 font-medium">OFF</span> Echo Cancellation, Noise Suppression, Auto Gain</li>
            </ol>
          </InfoBox>
        )}

        {selectedApp === "meet" && (
          <InfoBox variant="warning" title="Google Meet settings">
            <ol className="list-decimal list-inside space-y-1 text-base">
              <li>In a meeting: ⋮ → Settings → Audio</li>
              <li>Microphone: <code className="bg-gray-800 px-1 rounded">{virtualDevice}</code></li>
            </ol>
          </InfoBox>
        )}

        {/* Virtual audio help */}
        <CollapsibleSection title="Need virtual audio help?">
          <div className="text-base text-gray-200 space-y-2">
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
              <p>Open Settings on the main screen and re-run setup if the virtual mic is missing.</p>
            )}
          </div>
        </CollapsibleSection>
      </div>
    </WizardLayout>
  );
}
