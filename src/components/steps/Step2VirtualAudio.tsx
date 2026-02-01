import { useEffect, useRef } from "react";
import { WizardLayout } from "../wizard/WizardLayout";
import { InfoBox } from "../shared/InfoBox";
import { BigButton } from "../shared/BigButton";

interface Step2VirtualAudioProps {
  currentOS: "windows" | "macos" | "linux";
  onBack: () => void;
  onNext: () => void;
  onSetupLinuxAudio?: () => Promise<void>;
  // Linux setup state (managed by parent)
  linuxSetupInProgress?: boolean;
  linuxSetupComplete?: boolean;
  linuxSetupError?: string | null;
  linuxSetupLog?: string[];
}

export function Step2VirtualAudio({
  currentOS,
  onBack,
  onNext,
  onSetupLinuxAudio,
  linuxSetupInProgress = false,
  linuxSetupComplete = false,
  linuxSetupError = null,
  linuxSetupLog = [],
}: Step2VirtualAudioProps) {
  const hasAutoStarted = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-run setup on Linux when component mounts
  useEffect(() => {
    if (currentOS === "linux" && onSetupLinuxAudio && !hasAutoStarted.current && !linuxSetupComplete) {
      hasAutoStarted.current = true;
      onSetupLinuxAudio();
    }
  }, [currentOS, onSetupLinuxAudio, linuxSetupComplete]);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [linuxSetupLog]);

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
            <InfoBox variant="warning">
              <p className="text-sm">
                <strong>Note:</strong> Virtual audio devices are created fresh each time you start Vail Zoomer.
                This is normal and ensures clean audio routing.
              </p>
            </InfoBox>

            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-amber-400">Virtual Audio Setup</h3>
                {linuxSetupInProgress && (
                  <span className="text-sm text-amber-400 animate-pulse">Running...</span>
                )}
                {linuxSetupComplete && (
                  <span className="text-sm text-green-400">✓ Complete</span>
                )}
                {linuxSetupError && (
                  <span className="text-sm text-red-400">✗ Error</span>
                )}
              </div>

              {/* Verbose log display */}
              <div className="relative">
                <div className="bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs">
                  {linuxSetupLog.length === 0 ? (
                    <p className="text-gray-500">Waiting to start...</p>
                  ) : (
                    linuxSetupLog.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.startsWith("✓") ? "text-green-400" :
                          line.startsWith("✗") ? "text-red-400" :
                          line.startsWith("Warning") ? "text-amber-400" :
                          line.includes("Found sink") || line.includes("Found source") ? "text-blue-400" :
                          "text-gray-300"
                        }
                      >
                        {line}
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
                {linuxSetupLog.length > 0 && (
                  <button
                    onClick={() => {
                      const logText = linuxSetupLog.join("\n");
                      navigator.clipboard.writeText(logText);
                      // Brief visual feedback
                      const btn = document.getElementById("copy-log-btn");
                      if (btn) {
                        btn.textContent = "Copied!";
                        setTimeout(() => { btn.textContent = "Copy Log"; }, 1500);
                      }
                    }}
                    id="copy-log-btn"
                    className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded"
                  >
                    Copy Log
                  </button>
                )}
              </div>

              {linuxSetupError && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                  <p className="text-sm text-red-400"><strong>Error:</strong> {linuxSetupError}</p>
                </div>
              )}

              {linuxSetupComplete && (
                <div className="bg-green-900/30 border border-green-700 rounded-lg p-3">
                  <p className="text-sm text-green-400">
                    Virtual audio is ready! Your microphone and morse tones will be mixed together.
                  </p>
                </div>
              )}

              {/* Manual retry button if needed */}
              {(linuxSetupError || (!linuxSetupInProgress && !linuxSetupComplete)) && onSetupLinuxAudio && (
                <BigButton
                  onClick={() => onSetupLinuxAudio()}
                  disabled={linuxSetupInProgress}
                  className="!min-h-[44px] !py-2"
                >
                  {linuxSetupInProgress ? "Setting up..." : "Retry Setup"}
                </BigButton>
              )}
            </div>

            <InfoBox variant="info" title="Troubleshooting">
              <p className="text-sm">
                If setup fails, you may need to install dependencies first:
              </p>
              <code className="block mt-2 text-xs bg-gray-900 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                sudo apt-get install pulseaudio-utils pipewire-alsa libasound2-plugins
              </code>
              <p className="text-sm mt-2">
                Then restart the app and it will try again automatically.
              </p>
            </InfoBox>
          </div>
        )}
      </div>
    </WizardLayout>
  );
}
