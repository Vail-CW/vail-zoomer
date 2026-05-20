import { useEffect, useRef, useState } from "react";
import { WizardLayout } from "../wizard/WizardLayout";
import { InfoBox } from "../shared/InfoBox";
import { BigButton } from "../shared/BigButton";

interface Step2VirtualAudioProps {
  currentOS: "windows" | "macos" | "linux";
  onBack: () => void;
  onNext: () => void;
  onSetupLinuxAudio?: () => Promise<void>;
  onInstallLinuxAudioPrereqs?: () => Promise<void>;
  // Linux setup state (managed by parent)
  linuxSetupInProgress?: boolean;
  linuxSetupComplete?: boolean;
  linuxSetupError?: string | null;
  linuxSetupLog?: string[];
  linuxMissingPkgs?: string[];
  linuxInstallInProgress?: boolean;
}

export function Step2VirtualAudio({
  currentOS,
  onBack,
  onNext,
  onSetupLinuxAudio,
  onInstallLinuxAudioPrereqs,
  linuxSetupInProgress = false,
  linuxSetupComplete = false,
  linuxSetupError = null,
  linuxSetupLog = [],
  linuxMissingPkgs = [],
  linuxInstallInProgress = false,
}: Step2VirtualAudioProps) {
  const hasAutoStarted = useRef(false);
  const hasAutoAdvanced = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copiedKind, setCopiedKind] = useState<null | "log" | "error">(null);

  const copyToClipboard = (text: string, kind: "log" | "error") => {
    navigator.clipboard.writeText(text);
    setCopiedKind(kind);
    setTimeout(() => setCopiedKind((k) => (k === kind ? null : k)), 1500);
  };

  // Auto-run setup on Linux when component mounts (unless it already
  // succeeded out of band via the initialize() flow at app launch).
  useEffect(() => {
    if (currentOS === "linux" && onSetupLinuxAudio && !hasAutoStarted.current && !linuxSetupComplete) {
      hasAutoStarted.current = true;
      onSetupLinuxAudio();
    }
  }, [currentOS, onSetupLinuxAudio, linuxSetupComplete]);

  // On Linux, virtual audio setup is fully automatic — once it completes,
  // skip the user past this screen so they never have to click "Next".
  useEffect(() => {
    if (currentOS === "linux" && linuxSetupComplete && !hasAutoAdvanced.current) {
      hasAutoAdvanced.current = true;
      const t = setTimeout(() => onNext(), 800);
      return () => clearTimeout(t);
    }
  }, [currentOS, linuxSetupComplete, onNext]);

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
            {/* Single status card — verbose log lives behind Advanced. */}
            <div className="bg-gray-800 rounded-xl p-5 space-y-3">
              {/* Working state */}
              {linuxSetupInProgress && (
                <div className="flex items-center gap-3">
                  <span className="inline-block w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                  <p className="text-lg text-amber-300">Setting up audio routing…</p>
                </div>
              )}

              {/* Success state */}
              {!linuxSetupInProgress && linuxSetupComplete && !linuxSetupError && (
                <div className="flex items-center gap-3">
                  <span className="text-2xl text-green-400">✓</span>
                  <div>
                    <p className="text-lg text-green-300 font-medium">Audio routing is ready</p>
                    <p className="text-sm text-gray-400">
                      Virtual mic + speaker installed and will come back on every login.
                    </p>
                  </div>
                </div>
              )}

              {/* Missing packages — fixable with one click */}
              {!linuxSetupInProgress && linuxMissingPkgs.length > 0 && onInstallLinuxAudioPrereqs && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl text-amber-400">!</span>
                    <div>
                      <p className="text-lg text-amber-300 font-medium">Missing audio packages</p>
                      <p className="text-sm text-gray-400">
                        Install {linuxMissingPkgs.join(", ")} — you'll see one password prompt.
                      </p>
                    </div>
                  </div>
                  <BigButton
                    onClick={() => onInstallLinuxAudioPrereqs()}
                    disabled={linuxInstallInProgress}
                    className="!min-h-[44px] !py-2"
                  >
                    {linuxInstallInProgress ? "Installing…" : "Install now"}
                  </BigButton>
                </div>
              )}

              {/* Error state (no missing packages — actual failure) */}
              {!linuxSetupInProgress && linuxSetupError && linuxMissingPkgs.length === 0 && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl text-red-400">✗</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg text-red-300 font-medium">Audio setup failed</p>
                      <p className="text-sm text-gray-300 mt-1 break-words">{linuxSetupError}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        Copy the error and share it with the developers if retrying doesn't fix it.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {onSetupLinuxAudio && (
                      <BigButton
                        onClick={() => onSetupLinuxAudio()}
                        disabled={linuxInstallInProgress}
                        className="!min-h-[44px] !py-2 flex-1"
                      >
                        Retry
                      </BigButton>
                    )}
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `Vail Zoomer audio setup error:\n${linuxSetupError}\n\n--- Full log ---\n${linuxSetupLog.join("\n")}`,
                          "error",
                        )
                      }
                      className="px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"
                    >
                      {copiedKind === "error" ? "Copied!" : "Copy for developer"}
                    </button>
                  </div>
                </div>
              )}

              {/* Advanced toggle — opens the full log only on demand */}
              <div className="pt-2 border-t border-gray-700">
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-sm text-gray-400 hover:text-gray-200"
                >
                  {showAdvanced ? "▾ Hide advanced details" : "▸ Show advanced details"}
                </button>
              </div>

              {showAdvanced && (
                <div className="space-y-2">
                  <div className="relative">
                    <div className="bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs">
                      {linuxSetupLog.length === 0 ? (
                        <p className="text-gray-500">No log yet.</p>
                      ) : (
                        linuxSetupLog.map((line, i) => (
                          <div
                            key={i}
                            className={
                              line.startsWith("✓") ? "text-green-400" :
                              line.startsWith("✗") ? "text-red-400" :
                              line.startsWith("Warning") || line.startsWith("⚠") ? "text-amber-400" :
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
                        onClick={() => copyToClipboard(linuxSetupLog.join("\n"), "log")}
                        className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded"
                      >
                        {copiedKind === "log" ? "Copied!" : "Copy log"}
                      </button>
                    )}
                  </div>
                  {onSetupLinuxAudio && !linuxSetupInProgress && (
                    <button
                      onClick={() => onSetupLinuxAudio()}
                      disabled={linuxInstallInProgress}
                      className="text-sm text-amber-400 hover:text-amber-300 underline"
                    >
                      Re-run setup
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </WizardLayout>
  );
}
