import { useState } from "react";
import { WizardLayout } from "../wizard/WizardLayout";
import { InfoBox } from "../shared/InfoBox";
import { BigButton } from "../shared/BigButton";

interface Step2VirtualAudioProps {
  currentOS: "windows" | "macos" | "linux";
  onBack: () => void;
  onNext: () => void;
  onSetupLinuxAudio?: () => Promise<void>;
}

export function Step2VirtualAudio({
  currentOS,
  onBack,
  onNext,
  onSetupLinuxAudio,
}: Step2VirtualAudioProps) {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const handleLinuxSetup = async () => {
    if (!onSetupLinuxAudio) return;
    setIsSettingUp(true);
    setSetupError(null);
    try {
      await onSetupLinuxAudio();
      setSetupComplete(true);
    } catch (err) {
      setSetupError(String(err));
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <WizardLayout
      currentStep={2}
      totalSteps={4}
      stepLabels={["Vail Adapter", "Virtual Audio", "Audio", "Video App"]}
      title="Install Virtual Audio"
      onBack={onBack}
      onNext={onNext}
    >
      <div className="max-w-xl mx-auto space-y-4">
        <InfoBox variant="info">
          <p className="text-sm">
            Virtual audio creates a "pipe" to send morse tones to Zoom.
            Your mic audio + morse tones get mixed and sent through this virtual device.
          </p>
        </InfoBox>

        {currentOS === "windows" && (
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <h3 className="text-lg font-semibold text-amber-400">Install VB-Cable (Free)</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
                <li>
                  Download from{" "}
                  <a
                    href="https://vb-audio.com/Cable/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 underline"
                  >
                    vb-audio.com/Cable
                  </a>
                </li>
                <li>Extract the zip file</li>
                <li>Right-click <code className="bg-gray-700 px-1 rounded">VBCABLE_Setup_x64.exe</code> → Run as administrator</li>
                <li>Click "Install Driver" and follow prompts</li>
                <li><strong>Restart your computer</strong> after installation</li>
              </ol>
            </div>

            <InfoBox variant="warning" title="Already installed?">
              <p className="text-sm">
                If you've already installed VB-Cable and restarted, click Next Step to continue.
              </p>
            </InfoBox>
          </div>
        )}

        {currentOS === "macos" && (
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <h3 className="text-lg font-semibold text-amber-400">Install BlackHole (Free)</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
                <li>
                  Download <strong>BlackHole 2ch</strong> from{" "}
                  <a
                    href="https://existential.audio/blackhole/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 underline"
                  >
                    existential.audio/blackhole
                  </a>
                </li>
                <li>Open the downloaded .pkg file</li>
                <li>Follow the installer prompts</li>
                <li>Allow the system extension in System Preferences if prompted</li>
              </ol>
            </div>

            <InfoBox variant="warning" title="Already installed?">
              <p className="text-sm">
                If you've already installed BlackHole, click Next Step to continue.
              </p>
            </InfoBox>
          </div>
        )}

        {currentOS === "linux" && (
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <h3 className="text-lg font-semibold text-amber-400">Setup Virtual Audio Device</h3>
              <p className="text-sm text-gray-300">
                Vail Zoomer can automatically create a virtual audio device using PipeWire or PulseAudio.
              </p>

              <div className="flex gap-3">
                <BigButton
                  onClick={handleLinuxSetup}
                  disabled={isSettingUp || setupComplete}
                  className="!min-h-[44px] !py-2"
                >
                  {isSettingUp ? "Setting up..." : setupComplete ? "Setup Complete" : "Auto Setup"}
                </BigButton>
              </div>

              {setupError && (
                <p className="text-sm text-red-400">Error: {setupError}</p>
              )}

              {setupComplete && (
                <p className="text-sm text-green-400">Virtual audio device created successfully!</p>
              )}
            </div>

            <InfoBox variant="info" title="Manual Setup">
              <p className="text-sm">
                If auto setup doesn't work, you can create a virtual sink manually:
              </p>
              <code className="block mt-2 text-xs bg-gray-900 p-2 rounded overflow-x-auto">
                pactl load-module module-null-sink sink_name=VailZoomer sink_properties=device.description=VailZoomer
              </code>
            </InfoBox>
          </div>
        )}
      </div>
    </WizardLayout>
  );
}
