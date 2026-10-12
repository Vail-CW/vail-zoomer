import { ReactNode, useEffect, useState } from "react";
import { WizardLayout } from "../wizard/WizardLayout";
import { Card } from "../shared/Card";
import { Callout } from "../shared/Callout";
import { SegmentedControl } from "../shared/SegmentedControl";
import { StatusChip } from "../shared/StatusDot";

interface Step4VideoAppTipsProps {
  onBack: () => void;
  onComplete: () => void;
  currentOS: "windows" | "macos" | "linux";
  /** Reopened from the main screen: no stepper, "Done" instead of "Finish setup". */
  standalone?: boolean;
}

type VideoApp = "zoom" | "teams" | "discord" | "meet";

const VIDEO_APP_STORAGE_KEY = "vail-zoomer-last-video-app";

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-sm bg-surface3 px-1 py-0.5 font-mono text-sm">{children}</code>
);
const Off = () => (
  <StatusChip tone="danger" size="xs" className="align-middle">
    Off
  </StatusChip>
);

export function Step4VideoAppTips({ onBack, onComplete, currentOS, standalone = false }: Step4VideoAppTipsProps) {
  const [selectedApp, setSelectedApp] = useState<VideoApp>(() => {
    try {
      const saved = localStorage.getItem(VIDEO_APP_STORAGE_KEY);
      if (saved === "zoom" || saved === "teams" || saved === "discord" || saved === "meet") return saved;
    } catch {
      /* storage unavailable */
    }
    return "zoom";
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIDEO_APP_STORAGE_KEY, selectedApp);
    } catch {
      /* storage unavailable */
    }
  }, [selectedApp]);

  const virtualDevice =
    currentOS === "macos"
      ? "BlackHole 2ch"
      : currentOS === "linux"
      ? "Vail Zoomer Microphone"
      : "CABLE Output (VB-Audio Virtual Cable)";

  const mic = <Code>{virtualDevice}</Code>;

  return (
    <WizardLayout
      currentStep={4}
      totalSteps={4}
      stepLabels={["Keyer", "Virtual audio", "Audio", "Video app"]}
      title="Set up your video app"
      subtitle="Choose the virtual device as your microphone."
      onBack={onBack}
      onNext={onComplete}
      nextLabel={standalone ? "Done" : "Finish setup"}
      hideStepper={standalone}
    >
      <SegmentedControl
        aria-label="Video app"
        value={selectedApp}
        onChange={setSelectedApp}
        options={[
          { value: "zoom", label: "Zoom" },
          { value: "teams", label: "Teams" },
          { value: "discord", label: "Discord" },
          { value: "meet", label: "Meet" },
        ]}
      />

      {selectedApp === "zoom" && (
        <>
          <Card title="Zoom">
            <ol className="list-inside list-decimal space-y-1.5 text-base">
              <li>Settings, Audio, Microphone: {mic}</li>
              <li>
                Automatically adjust volume <Off />
              </li>
              <li>
                Microphone modes: pick <strong>Original sound for musicians</strong>
              </li>
              <li>
                High-fidelity music mode <Off />
              </li>
              <li>
                Noise suppression and echo cancellation <Off />
              </li>
            </ol>
          </Card>
          <Callout tone="info">
            With high-fidelity music mode on, Zoom's Test Mic will not pick up the tones. They do work in a real call.
          </Callout>
        </>
      )}

      {selectedApp === "teams" && (
        <Card title="Teams">
          <ol className="list-inside list-decimal space-y-1.5 text-base">
            <li>Profile, Settings, Devices</li>
            <li>Microphone: {mic}</li>
            <li>
              Noise suppression <Off />
            </li>
          </ol>
        </Card>
      )}

      {selectedApp === "discord" && (
        <Card title="Discord">
          <ol className="list-inside list-decimal space-y-1.5 text-base">
            <li>User Settings, Voice and Video</li>
            <li>Input Device: {mic}</li>
            <li>
              Automatic input sensitivity <Off />
            </li>
            <li>
              Echo cancellation, noise suppression, automatic gain <Off />
            </li>
          </ol>
        </Card>
      )}

      {selectedApp === "meet" && (
        <Card title="Google Meet">
          <ol className="list-inside list-decimal space-y-1.5 text-base">
            <li>In a meeting, open More options, then Settings, then Audio</li>
            <li>Microphone: {mic}</li>
          </ol>
        </Card>
      )}

      <p className="text-sm text-muted">
        {currentOS === "windows" && (
          <>
            Missing the device? Install VB-Cable from{" "}
            <a
              href="https://vb-audio.com/Cable/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded text-accent-text underline underline-offset-2"
            >
              vb-audio.com/Cable
            </a>{" "}
            and restart.
          </>
        )}
        {currentOS === "macos" && (
          <>
            Missing the device? Install BlackHole from{" "}
            <a
              href="https://existential.audio/blackhole/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded text-accent-text underline underline-offset-2"
            >
              existential.audio/blackhole
            </a>
            .
          </>
        )}
        {currentOS === "linux" && "Missing the device? Re-run setup from Settings."}
      </p>
    </WizardLayout>
  );
}
