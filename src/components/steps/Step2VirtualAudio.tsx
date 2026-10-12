import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WizardLayout } from "../wizard/WizardLayout";
import { Card } from "../shared/Card";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { StatusDot } from "../shared/StatusDot";
import { ChevronDownIcon, ChevronRightIcon, CopyIcon, DownloadIcon, RefreshIcon, SpinnerIcon } from "../shared/icons";
import { DeviceInfo, findVirtualOutput } from "../audio/audioHelpers";

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

const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="rounded text-accent-text underline underline-offset-2 hover:opacity-80"
  >
    {children}
  </a>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded-sm bg-surface3 px-1 py-0.5 font-mono text-sm">{children}</code>
);

function DisclosureButton({ open, onClick, children }: { open: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="flex h-8 items-center gap-1 rounded text-sm text-muted transition-colors hover:text-ink"
    >
      {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
      {children}
    </button>
  );
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
  // Detect whether the platform's virtual audio driver is already installed,
  // so Mac/Windows users sail through this step like Linux users do.
  const driverInstalled =
    (currentOS === "macos" || currentOS === "windows") && findVirtualOutput(outputDevices, currentOS) !== null;

  // Auto-advance Mac/Windows users past this step when the driver is already
  // present, mirroring the Linux flow below.
  const hasAutoAdvancedNonLinux = useRef(false);
  useEffect(() => {
    if ((currentOS === "macos" || currentOS === "windows") && driverInstalled && !hasAutoAdvancedNonLinux.current) {
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

  // Launch the bundled VB-Cable installer (Windows only). This is the one place
  // the driver install happens. Setup never touches it, so security software
  // sees a deliberate, user-initiated action with a normal UAC prompt.
  const handleInstallVbcable = async () => {
    setVbcableError(null);
    setVbcableLaunching(true);
    try {
      await invoke("install_vbcable");
    } catch (e) {
      // The backend returns short, friendly strings. Show those as-is, but fall
      // back to a plain message for anything unexpected.
      console.error("VB-Cable install failed:", e);
      const msg =
        typeof e === "string" && e.trim().length > 0
          ? e
          : "Could not start the VB-Cable installer. Try the manual download below.";
      setVbcableError(msg);
    } finally {
      setVbcableLaunching(false);
    }
  };

  const copyToClipboard = (text: string, kind: "log" | "error") => {
    navigator.clipboard.writeText(text);
    setCopiedKind(kind);
    setTimeout(() => setCopiedKind((k) => (k === kind ? null : k)), 1500);
  };

  // Auto-run setup on Linux when the component mounts (unless it already
  // succeeded out of band via the initialize() flow at app launch).
  useEffect(() => {
    if (currentOS === "linux" && onSetupLinuxAudio && !hasAutoStarted.current && !linuxSetupComplete) {
      hasAutoStarted.current = true;
      onSetupLinuxAudio();
    }
  }, [currentOS, onSetupLinuxAudio, linuxSetupComplete]);

  // On Linux, virtual audio setup is fully automatic. Once it completes, skip
  // the user past this screen.
  useEffect(() => {
    if (currentOS === "linux" && linuxSetupComplete && !hasAutoAdvanced.current) {
      hasAutoAdvanced.current = true;
      const t = setTimeout(() => onNext(), 800);
      return () => clearTimeout(t);
    }
  }, [currentOS, linuxSetupComplete, onNext]);

  // Keep the log scrolled to the newest line.
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [linuxSetupLog]);

  // Backend log lines may start with a check (0x2713), cross (0x2717) or
  // warning (0x26A0) mark; classify by code point rather than printing them.
  const logTone = (line: string) => {
    const first = line.codePointAt(0);
    if (first === 0x2713 || line.startsWith("OK")) return "text-success-fg";
    if (first === 0x2717 || line.startsWith("Error")) return "text-danger-fg";
    if (first === 0x26a0 || line.startsWith("Warning")) return "text-warn-fg";
    return "text-ink";
  };

  const driverName = currentOS === "macos" ? "BlackHole" : "VB-Cable";

  return (
    <WizardLayout
      currentStep={2}
      totalSteps={4}
      stepLabels={["Keyer", "Virtual audio", "Audio", "Video app"]}
      title="Virtual audio"
      subtitle="A small audio bridge sends your voice and the morse tone to Zoom together."
      onBack={onBack}
      onNext={onNext}
    >
      {(currentOS === "macos" || currentOS === "windows") && driverInstalled && !forceShowInstall && (
        <Card>
          <div className="flex items-center gap-2">
            <StatusDot tone="success" />
            <p className="flex-1 text-base">{driverName} detected. Moving on.</p>
            <Button variant="ghost" onClick={() => setForceShowInstall(true)}>
              Show install steps
            </Button>
          </div>
        </Card>
      )}

      {currentOS === "windows" && (!driverInstalled || forceShowInstall) && (
        <Card title="Install VB-Cable (free)" description="A virtual audio driver from VB-Audio. Windows asks for administrator permission.">
          <div className="space-y-3">
            <Button
              variant="primary"
              size="md"
              icon={<DownloadIcon />}
              loading={vbcableLaunching}
              onClick={handleInstallVbcable}
            >
              {vbcableLaunching ? "Starting installer" : "Install VB-Cable"}
            </Button>
            {vbcableError && <p className="break-words text-sm text-danger-fg">{vbcableError}</p>}
            <p className="text-sm text-muted">
              In the VB-Cable window click <strong className="text-ink">Install Driver</strong>, then{" "}
              <strong className="text-ink">restart your computer</strong>. It is detected automatically when you
              come back.
            </p>
            <div className="border-t border-line pt-2">
              <DisclosureButton open={showManualVbcable} onClick={() => setShowManualVbcable((v) => !v)}>
                Download it yourself
              </DisclosureButton>
              {showManualVbcable && (
                <ol className="mt-1 list-inside list-decimal space-y-1 text-base">
                  <li>
                    Download from <Link href="https://vb-audio.com/Cable/">vb-audio.com/Cable</Link>
                  </li>
                  <li>Extract the zip file</li>
                  <li>
                    Right-click <Code>VBCABLE_Setup_x64.exe</Code> and choose Run as administrator
                  </li>
                  <li>Click Install Driver, then restart your computer</li>
                </ol>
              )}
            </div>
          </div>
        </Card>
      )}

      {currentOS === "macos" && (!driverInstalled || forceShowInstall) && (
        <Card title="Install BlackHole (free)" description="It is detected automatically when you come back.">
          <ol className="list-inside list-decimal space-y-1 text-base">
            <li>
              Download <strong>BlackHole 2ch</strong> from{" "}
              <Link href="https://existential.audio/blackhole/">existential.audio/blackhole</Link>
            </li>
            <li>Open the downloaded .pkg file and follow the prompts</li>
            <li>If macOS asks, allow the system extension in System Settings</li>
          </ol>
        </Card>
      )}

      {currentOS === "linux" && (
        <Card>
          <div className="space-y-3">
            {linuxSetupInProgress && (
              <div className="flex items-center gap-2 text-base">
                <SpinnerIcon className="text-muted" />
                <span>Setting up audio routing</span>
              </div>
            )}

            {!linuxSetupInProgress && linuxSetupComplete && !linuxSetupError && (
              <div className="flex items-center gap-2">
                <StatusDot tone="success" />
                <p className="text-base">Audio routing is ready. It comes back on every login.</p>
              </div>
            )}

            {!linuxSetupInProgress && linuxMissingPkgs.length > 0 && onInstallLinuxAudioPrereqs && (
              <Callout
                tone="warn"
                title="Missing audio packages"
                action={
                  <Button
                    variant="primary"
                    loading={linuxInstallInProgress}
                    onClick={() => onInstallLinuxAudioPrereqs()}
                  >
                    {linuxInstallInProgress ? "Installing" : "Install now"}
                  </Button>
                }
              >
                Install {linuxMissingPkgs.join(", ")}. You will see one password prompt.
              </Callout>
            )}

            {!linuxSetupInProgress && linuxSetupError && linuxMissingPkgs.length === 0 && (
              <Callout tone="danger" title="Audio setup failed">
                <p className="break-words">{linuxSetupError}</p>
                <div className="mt-2 flex gap-2">
                  {onSetupLinuxAudio && (
                    <Button
                      variant="primary"
                      icon={<RefreshIcon />}
                      disabled={linuxInstallInProgress}
                      onClick={() => onSetupLinuxAudio()}
                    >
                      Retry
                    </Button>
                  )}
                  <Button
                    icon={<CopyIcon />}
                    onClick={() =>
                      copyToClipboard(
                        `Vail Zoomer audio setup error:\n${linuxSetupError}\n\n--- Full log ---\n${linuxSetupLog.join("\n")}`,
                        "error",
                      )
                    }
                  >
                    {copiedKind === "error" ? "Copied" : "Copy for developer"}
                  </Button>
                </div>
              </Callout>
            )}

            <div className="border-t border-line pt-2">
              <DisclosureButton open={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
                Details
              </DisclosureButton>
            </div>

            {showAdvanced && (
              <div className="space-y-2">
                <div className="relative">
                  <div className="max-h-48 overflow-y-auto rounded border border-line bg-app p-3 font-mono text-sm">
                    {linuxSetupLog.length === 0 ? (
                      <p className="text-muted">No log yet.</p>
                    ) : (
                      linuxSetupLog.map((line, i) => (
                        <div key={i} className={logTone(line)}>
                          {line}
                        </div>
                      ))
                    )}
                    <div ref={logEndRef} />
                  </div>
                  {linuxSetupLog.length > 0 && (
                    <Button
                      className="absolute right-2 top-2"
                      icon={<CopyIcon />}
                      onClick={() => copyToClipboard(linuxSetupLog.join("\n"), "log")}
                    >
                      {copiedKind === "log" ? "Copied" : "Copy log"}
                    </Button>
                  )}
                </div>
                {onSetupLinuxAudio && !linuxSetupInProgress && (
                  <Button
                    variant="ghost"
                    icon={<RefreshIcon />}
                    disabled={linuxInstallInProgress}
                    onClick={() => onSetupLinuxAudio()}
                  >
                    Re-run setup
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      )}
    </WizardLayout>
  );
}
