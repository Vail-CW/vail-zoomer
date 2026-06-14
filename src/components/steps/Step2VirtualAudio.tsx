import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WizardLayout } from "../wizard/WizardLayout";
import { InfoBox } from "../shared/InfoBox";
import { BigButton } from "../shared/BigButton";

interface DeviceInfo {
  display_name: string;
  internal_name: string;
}

interface Step2VirtualAudioProps {
  currentOS: "windows" | "macos" | "linux";
  outputDevices: DeviceInfo[];
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
  outputDevices,
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
  // Detect whether the platform-specific virtual audio driver is already
  // installed. This lets Mac/Windows users sail through Step 2 like Linux
  // already does, instead of having to read install instructions for
  // software they already installed weeks ago.
  const isMacDriverInstalled = outputDevices.some(d => {
    const i = d.internal_name.toLowerCase();
    const n = d.display_name.toLowerCase();
    return i.includes("blackhole") || n.includes("blackhole");
  });
  const isWinDriverInstalled = outputDevices.some(d => {
    const i = d.internal_name.toLowerCase();
    const n = d.display_name.toLowerCase();
    return i.includes("cable") || n.includes("cable") || i.includes("vb-audio") || n.includes("vb-audio");
  });
  const driverInstalled =
    (currentOS === "macos" && isMacDriverInstalled) ||
    (currentOS === "windows" && isWinDriverInstalled);

  // Auto-advance Mac/Windows users past this step when the driver is already
  // present — mirrors the Linux flow below.
  const hasAutoAdvancedNonLinux = useRef(false);
  useEffect(() => {
    if (
      (currentOS === "macos" || currentOS === "windows")
      && driverInstalled
      && !hasAutoAdvancedNonLinux.current
    ) {
      hasAutoAdvancedNonLinux.current = true;
      const t = setTimeout(() => onNext(), 800);
      return () => clearTimeout(t);
    }
  }, [currentOS, driverInstalled, onNext]);

  const hasAutoStarted = useRef(false);
  const hasAutoAdvanced = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copiedKind, setCopiedKind] = useState<null | "log" | "error">(null);
  const [forceShowInstall, setForceShowInstall] = useState(false);
  const [vbcableLaunching, setVbcableLaunching] = useState(false);
  const [vbcableError, setVbcableError] = useState<string | null>(null);
  const [showManualVbcable, setShowManualVbcable] = useState(false);

  // Launch the bundled VB-Cable installer (Windows). This is the only place the
  // driver install happens — setup never touches it — so security software sees
  // a deliberate, user-initiated action with a normal UAC prompt.
  const handleInstallVbcable = async () => {
    setVbcableError(null);
    setVbcableLaunching(true);
    try {
      await invoke("install_vbcable");
    } catch (e) {
      setVbcableError(String(e));
    } finally {
      setVbcableLaunching(false);
    }
  };

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
      stepLabels={["Keyer", "Virtual audio", "Audio", "Video app"]}
      title="Install virtual audio"
      onBack={onBack}
      onNext={onNext}
    >
      <div className="max-w-xl mx-auto space-y-4">
        {!driverInstalled && (
          <InfoBox variant="info">
            <p className="text-base">
              Zoom can't hear morse tones on its own. We'll install a small audio bridge so
              your voice and the tones go to Zoom together.
            </p>
          </InfoBox>
        )}

        {/* Detected — Mac/Windows fast path */}
        {(currentOS === "macos" || currentOS === "windows") && driverInstalled && !forceShowInstall && (
          <div className="bg-gray-800 rounded-2xl p-5 flex items-start gap-3">
            <span className="text-3xl text-green-400 leading-none">✓</span>
            <div className="flex-1">
              <p className="text-lg text-green-300 font-medium">
                {currentOS === "macos" ? "BlackHole detected" : "VB-Cable detected"}
              </p>
              <p className="text-base text-gray-200 mt-1">
                You're already set. Moving you to the next step…
              </p>
              <button
                onClick={() => setForceShowInstall(true)}
                className="mt-3 min-h-[44px] px-3 text-sm text-gray-300 hover:text-amber-300 underline"
              >
                Show install instructions anyway
              </button>
            </div>
          </div>
        )}

        {currentOS === "windows" && (!isWinDriverInstalled || forceShowInstall) && (
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xl font-semibold text-amber-400">Install VB-Cable (free)</h3>
              <p className="text-base text-gray-200">
                VB-Cable is a free virtual audio driver from VB-Audio. Click below to run the
                installer — Windows will ask for administrator permission.
              </p>

              <BigButton
                onClick={handleInstallVbcable}
                disabled={vbcableLaunching}
                className="!min-h-[48px] !py-2"
              >
                {vbcableLaunching ? "Starting installer…" : "Install VB-Cable"}
              </BigButton>

              {vbcableError && (
                <p className="text-base text-red-300 break-words">{vbcableError}</p>
              )}

              <p className="text-sm text-gray-400">
                In the VB-Cable window, click <strong>Install Driver</strong>, then{" "}
                <strong>restart your computer</strong>. After the restart, come back here and
                VB-Cable will be detected automatically.
              </p>

              <div className="pt-2 border-t border-gray-700">
                <button
                  onClick={() => setShowManualVbcable((v) => !v)}
                  className="min-h-[44px] text-sm text-gray-300 hover:text-gray-100"
                >
                  {showManualVbcable ? "▾ Hide manual download" : "▸ Prefer to download it yourself?"}
                </button>
                {showManualVbcable && (
                  <ol className="mt-2 list-decimal list-inside space-y-2 text-base text-gray-200">
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
                    <li>Click "Install Driver" and follow the prompts</li>
                    <li><strong>Restart your computer</strong> after installation</li>
                  </ol>
                )}
              </div>
            </div>
            <InfoBox variant="info">
              <p className="text-base">
                After installing and restarting, come back here — VB-Cable will be detected
                automatically and we'll move you on.
              </p>
            </InfoBox>
          </div>
        )}

        {currentOS === "macos" && (!isMacDriverInstalled || forceShowInstall) && (
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xl font-semibold text-amber-400">Install BlackHole (free)</h3>
              <ol className="list-decimal list-inside space-y-2 text-base text-gray-200">
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
                <li>If macOS asks, allow the system extension in System Settings</li>
              </ol>
            </div>
            <InfoBox variant="info">
              <p className="text-base">
                After installing, come back here — BlackHole will be detected automatically.
              </p>
            </InfoBox>
          </div>
        )}

        {currentOS === "linux" && (
          <div className="space-y-3">
            {/* Single status card — verbose log lives behind Advanced. */}
            <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
              {/* Working state */}
              {linuxSetupInProgress && (
                <div className="flex items-center gap-3">
                  <span className="inline-block w-4 h-4 rounded-full bg-amber-400 animate-pulse" />
                  <p className="text-lg text-amber-300">Setting up audio routing…</p>
                </div>
              )}

              {/* Success state */}
              {!linuxSetupInProgress && linuxSetupComplete && !linuxSetupError && (
                <div className="flex items-center gap-3">
                  <span className="text-3xl text-green-400 leading-none">✓</span>
                  <div>
                    <p className="text-lg text-green-300 font-medium">Audio routing is ready</p>
                    <p className="text-base text-gray-200">
                      Virtual mic + speaker installed and will come back on every login.
                    </p>
                  </div>
                </div>
              )}

              {/* Missing packages — fixable with one click */}
              {!linuxSetupInProgress && linuxMissingPkgs.length > 0 && onInstallLinuxAudioPrereqs && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl text-amber-400 leading-none">!</span>
                    <div>
                      <p className="text-lg text-amber-300 font-medium">Missing audio packages</p>
                      <p className="text-base text-gray-200">
                        Install {linuxMissingPkgs.join(", ")} — you'll see one password prompt.
                      </p>
                    </div>
                  </div>
                  <BigButton
                    onClick={() => onInstallLinuxAudioPrereqs()}
                    disabled={linuxInstallInProgress}
                    className="!min-h-[48px] !py-2"
                  >
                    {linuxInstallInProgress ? "Installing…" : "Install now"}
                  </BigButton>
                </div>
              )}

              {/* Error state (no missing packages — actual failure) */}
              {!linuxSetupInProgress && linuxSetupError && linuxMissingPkgs.length === 0 && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl text-red-400 leading-none">✗</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg text-red-300 font-medium">Audio setup failed</p>
                      <p className="text-base text-gray-200 mt-1 break-words">{linuxSetupError}</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Copy the error and share it with the developers if retrying doesn't fix it.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {onSetupLinuxAudio && (
                      <BigButton
                        onClick={() => onSetupLinuxAudio()}
                        disabled={linuxInstallInProgress}
                        className="!min-h-[48px] !py-2 flex-1"
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
                      className="min-h-[44px] px-3 text-base bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"
                    >
                      {copiedKind === "error" ? "Copied" : "Copy for developer"}
                    </button>
                  </div>
                </div>
              )}

              {/* Advanced toggle — opens the full log only on demand */}
              <div className="pt-2 border-t border-gray-700">
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="min-h-[44px] text-base text-gray-300 hover:text-gray-100"
                >
                  {showAdvanced ? "▾ Hide advanced details" : "▸ Show advanced details"}
                </button>
              </div>

              {showAdvanced && (
                <div className="space-y-2">
                  <div className="relative">
                    <div className="bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-sm">
                      {linuxSetupLog.length === 0 ? (
                        <p className="text-gray-400">No log yet.</p>
                      ) : (
                        linuxSetupLog.map((line, i) => (
                          <div
                            key={i}
                            className={
                              line.startsWith("✓") ? "text-green-400" :
                              line.startsWith("✗") ? "text-red-400" :
                              line.startsWith("Warning") || line.startsWith("⚠") ? "text-amber-400" :
                              "text-gray-200"
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
                        className="absolute top-2 right-2 min-h-[36px] text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded"
                      >
                        {copiedKind === "log" ? "Copied" : "Copy log"}
                      </button>
                    )}
                  </div>
                  {onSetupLinuxAudio && !linuxSetupInProgress && (
                    <button
                      onClick={() => onSetupLinuxAudio()}
                      disabled={linuxInstallInProgress}
                      className="min-h-[44px] text-base text-amber-400 hover:text-amber-300 underline"
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
