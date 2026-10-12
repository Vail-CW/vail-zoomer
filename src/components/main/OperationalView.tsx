import { useEffect, useRef, useState } from "react";
import { Button } from "../shared/Button";
import { IconButton } from "../shared/IconButton";
import { Card } from "../shared/Card";
import { Switch } from "../shared/Switch";
import { Select } from "../shared/Select";
import { Stepper } from "../shared/Stepper";
import { Meter } from "../shared/Meter";
import { KeyLamp } from "../shared/KeyLamp";
import { StatusChip, Tone } from "../shared/StatusDot";
import {
  ChevronRightIcon,
  HeadphonesIcon,
  HelpIcon,
  MaximizeIcon,
  MicIcon,
  MinimizeIcon,
  PlayIcon,
  RadioIcon,
  RecordIcon,
  SettingsIcon,
  StopIcon,
  VideoIcon,
  VolumeIcon,
  WrenchIcon,
  XIcon,
} from "../shared/icons";
import { OSType, VirtualOutputRow, friendlyMidiName } from "../audio";
import { KEYER_TYPES } from "../audio/keyerTypes";
import { DecoderPanel } from "./DecoderPanel";
import { KeyingTrace } from "./KeyingTrace";

type TestRecordingState = "idle" | "recording" | "playing";

const HEADPHONES_HINT_KEY = "vail-zoomer-headphones-hint-dismissed";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

interface OperationalViewProps {
  // Status
  midiConnected: boolean;
  audioStarted: boolean;
  isKeyDown: boolean;
  estimatedWpm: number;
  selectedMidiDevice: string | null;
  selectedInputDevice: string | null;
  inputDevices: { display_name: string; internal_name: string }[];

  // CW decoder
  cwText: string;
  onClearCwText: () => void;

  // Levels
  micLevel: number;
  outputLevel: number;

  // Mic ducking
  micDucking: boolean;
  onMicDuckingChange: (enabled: boolean) => void;

  // Sidetone routing, used to surface the local monitor device in the top bar.
  sidetoneRoute: string;
  selectedLocalDevice: string | null;
  outputDevices: { display_name: string; internal_name: string }[];

  // Forced virtual output: read-only status plus a path to the install flow.
  currentOS: OSType;
  onSetupOutput: () => void;

  // Quick controls
  keyerType: string;
  wpm: number;
  sidetoneFrequency: number;
  onKeyerTypeChange: (type: string) => void;
  onWpmChange: (wpm: number) => void;
  onSidetoneFrequencyChange: (hz: number) => void;

  // Handlers
  onOpenSettings: () => void;
  onOpenVideoTips: () => void;
  onOpenHelp: () => void;
  onOpenTroubleshoot: () => void;

  // Test recording
  testRecordingState: TestRecordingState;
  testRecordingCountdown: number;
  testPlaybackProgress: number;
  onStartTestRecording: () => void;
  onStopTestRecording: () => void;
  onStopTestPlayback: () => void;

  /** Set only for a real MIDI failure; turns the keyer chip red. */
  midiError?: string | null;
  /** Dits/dahs of the character currently being keyed, e.g. "-.." */
  currentElements?: string;
  /** Mini mode: header, key lamp + WPM, keying trace, one-line decoder. */
  compact?: boolean;
  onToggleCompact?: () => void;
  practiceMode?: boolean;
  onPracticeModeChange?: (on: boolean) => void;
  /** Called (debounced 150 ms) when the tone stepper changes, so the app can play a preview. */
  onPreviewTone?: (hz: number) => void;
}

function Node({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1 rounded border border-line bg-surface2/40 p-2">
      <div className="flex items-center gap-1.5 text-sm text-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex h-4 items-center">{children}</div>
    </div>
  );
}

export function OperationalView({
  midiConnected,
  audioStarted,
  isKeyDown,
  estimatedWpm,
  selectedMidiDevice,
  selectedInputDevice,
  inputDevices,
  cwText,
  onClearCwText,
  micLevel,
  outputLevel,
  micDucking,
  onMicDuckingChange,
  sidetoneRoute,
  selectedLocalDevice,
  outputDevices,
  currentOS,
  onSetupOutput,
  keyerType,
  wpm,
  sidetoneFrequency,
  onKeyerTypeChange,
  onWpmChange,
  onSidetoneFrequencyChange,
  onOpenSettings,
  onOpenVideoTips,
  onOpenHelp,
  onOpenTroubleshoot,
  testRecordingState,
  testRecordingCountdown,
  testPlaybackProgress,
  onStartTestRecording,
  onStopTestRecording,
  onStopTestPlayback,
  midiError = null,
  currentElements,
  compact = false,
  onToggleCompact,
  practiceMode = false,
  onPracticeModeChange,
  onPreviewTone,
}: OperationalViewProps) {
  // Tone stepper: apply immediately, preview (debounced) so the new pitch is audible.
  const previewTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    },
    [],
  );
  const changeTone = (hz: number) => {
    onSidetoneFrequencyChange(hz);
    if (onPreviewTone) {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = window.setTimeout(() => onPreviewTone(hz), 150);
    }
  };

  const [hintDismissed, setHintDismissed] = useState(() => readFlag(HEADPHONES_HINT_KEY));
  const dismissHint = () => {
    setHintDismissed(true);
    try {
      localStorage.setItem(HEADPHONES_HINT_KEY, "true");
    } catch {
      /* storage unavailable */
    }
  };

  const micLabel = (() => {
    if (!audioStarted) return "Audio off";
    if (!selectedInputDevice) return "No mic selected";
    const match = inputDevices.find((d) => d.internal_name === selectedInputDevice);
    return match ? match.display_name : "Mic ready";
  })();
  const micTone: Tone = audioStarted && selectedInputDevice ? "success" : "warn";

  const keyerLabel = midiConnected
    ? selectedMidiDevice
      ? friendlyMidiName(selectedMidiDevice)
      : "Vail Adapter"
    : midiError
    ? "Keyer error"
    : "No adapter";
  const keyerTone: Tone = midiConnected ? "success" : midiError ? "danger" : "warn";

  const toneOutputLabel = (() => {
    if (!selectedLocalDevice) return "Not selected";
    const match = outputDevices.find((d) => d.internal_name === selectedLocalDevice);
    return match ? match.display_name : selectedLocalDevice;
  })();

  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3 text-ink">
        <header className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <KeyLamp down={isKeyDown} size={14} />
            <span className="w-20 font-mono text-lg tabular-nums text-ink" aria-live="polite">
              {estimatedWpm > 0 ? `${estimatedWpm.toFixed(0)} WPM` : "- WPM"}
            </span>
            {practiceMode && (
              <StatusChip tone="warn" size="xs">
                Practice
              </StatusChip>
            )}
          </div>
          <IconButton aria-label="Expand to full window" onClick={onToggleCompact}>
            <MaximizeIcon />
          </IconButton>
        </header>
        <KeyingTrace isKeyDown={isKeyDown} />
        <DecoderPanel cwText={cwText} onClear={onClearCwText} currentElements={currentElements} singleLine />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden text-ink">
      {/* Top bar */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            title={midiError ?? "Open settings"}
            className="min-w-0 rounded-full"
          >
            <StatusChip tone={keyerTone} dot className="max-w-[10rem] cursor-pointer">
              {keyerLabel}
            </StatusChip>
          </button>
          <button type="button" onClick={onOpenSettings} title="Open settings" className="min-w-0 rounded-full">
            <StatusChip tone={micTone} dot icon={<MicIcon size={12} />} className="max-w-[12rem] cursor-pointer">
              {micLabel}
            </StatusChip>
          </button>
          {sidetoneRoute === "Both" && (
            <button
              type="button"
              onClick={onOpenSettings}
              title="Sidetone monitor (only you hear this)"
              className="hidden min-w-0 rounded-full md:block"
            >
              <StatusChip tone="neutral" icon={<VolumeIcon size={12} />} className="max-w-[10rem] cursor-pointer">
                {toneOutputLabel}
              </StatusChip>
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          {onToggleCompact && (
            <IconButton aria-label="Switch to mini window" onClick={onToggleCompact}>
              <MinimizeIcon />
            </IconButton>
          )}
          <IconButton aria-label="Open troubleshooting" onClick={onOpenTroubleshoot}>
            <WrenchIcon />
          </IconButton>
          <IconButton aria-label="Open help" onClick={onOpenHelp}>
            <HelpIcon />
          </IconButton>
          <IconButton aria-label="Open settings" onClick={onOpenSettings}>
            <SettingsIcon />
          </IconButton>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
        {practiceMode && (
          <div className="flex h-7 shrink-0 items-center gap-2 rounded-md border border-warn/30 bg-warn/10 px-2.5 text-sm text-warn-fg">
            Practice mode is on. Nothing is sent to your video app.
          </div>
        )}
        {!hintDismissed && (
          <div
            role="status"
            className="flex h-7 shrink-0 items-center gap-2 rounded-md border border-info/30 bg-info/10 pl-2.5 pr-1 text-sm text-ink"
          >
            <HeadphonesIcon className="shrink-0 text-info-fg" />
            <span className="min-w-0 flex-1 truncate">Wear headphones so your mic does not pick up the tone.</span>
            <button type="button" onClick={onOpenTroubleshoot} className="shrink-0 text-info-fg hover:underline">
              Why?
            </button>
            <IconButton aria-label="Dismiss" onClick={dismissHint} className="h-6 w-6">
              <XIcon />
            </IconButton>
          </div>
        )}

        <VirtualOutputRow outputDevices={outputDevices} currentOS={currentOS} onSetup={onSetupOutput} className="shrink-0" />

        {/* Signal flow: mic -> key -> video app */}
        <Card
          title="Signal"
          className="shrink-0 !p-2.5"
          action={
            <div className="flex shrink-0 items-center gap-2">
              {testRecordingState === "idle" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onStartTestRecording}
                  disabled={!audioStarted}
                  className="!h-7"
                  title="Record 5 s and hear what your video app hears"
                  icon={<RecordIcon className="text-danger" />}
                >
                  Test recording
                </Button>
              )}
              {testRecordingState === "recording" && (
                <>
                  <StatusChip tone="danger" icon={<RecordIcon size={12} />}>
                    Recording {testRecordingCountdown}s
                  </StatusChip>
                  <Button size="sm" variant="secondary" className="!h-7" onClick={onStopTestRecording} icon={<StopIcon />}>
                    Stop
                  </Button>
                </>
              )}
              {testRecordingState === "playing" && (
                <>
                  <PlayIcon className="text-success-fg" />
                  <div className="h-1 w-20 overflow-hidden rounded-full bg-surface3">
                    <div className="h-full bg-success" style={{ width: `${testPlaybackProgress * 100}%` }} />
                  </div>
                  <Button size="sm" variant="secondary" className="!h-7" onClick={onStopTestPlayback} icon={<StopIcon />}>
                    Stop
                  </Button>
                </>
              )}
            </div>
          }
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <Node icon={<MicIcon />} label="Your mic">
              <Meter level={micLevel} label="Your mic" />
            </Node>
            <ChevronRightIcon className="text-faint" />
            <Node icon={<RadioIcon />} label="Vail Adapter">
              <div className="flex items-center gap-2">
                <KeyLamp down={isKeyDown} size={14} />
                <span className={`w-14 text-sm ${isKeyDown ? "text-accent-text" : "text-muted"}`}>
                  {isKeyDown ? "Keying" : "Idle"}
                </span>
              </div>
            </Node>
            <ChevronRightIcon className="text-faint" />
            <Node icon={<VideoIcon />} label={practiceMode ? "Video app (muted)" : "Video app"}>
              <Meter level={outputLevel} label="Video app" />
            </Node>
          </div>
        </Card>

        <div className="shrink-0">
          <KeyingTrace isKeyDown={isKeyDown} />
        </div>

        {/* Quick controls */}
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 rounded-md border border-line bg-surface px-2.5 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-sm text-muted">Key</span>
            <Select
              aria-label="Key type"
              className="min-w-0 flex-1"
              value={keyerType}
              onChange={onKeyerTypeChange}
              options={KEYER_TYPES}
              hidePlaceholder
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Speed</span>
            <Stepper
              value={`${wpm} WPM`}
              valueWidth="w-20"
              decreaseLabel="Decrease speed"
              increaseLabel="Increase speed"
              onDecrease={() => onWpmChange(Math.max(5, wpm - 1))}
              onIncrease={() => onWpmChange(Math.min(50, wpm + 1))}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Tone</span>
            <Stepper
              value={`${sidetoneFrequency} Hz`}
              valueWidth="w-20"
              decreaseLabel="Lower tone"
              increaseLabel="Raise tone"
              onDecrease={() => changeTone(Math.max(300, sidetoneFrequency - 25))}
              onIncrease={() => changeTone(Math.min(1200, sidetoneFrequency + 25))}
            />
          </div>
        </div>

        {/* Options: one compact row */}
        <div className="flex h-9 shrink-0 items-center gap-4 rounded-md border border-line bg-surface px-2.5">
          <label
            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-base"
            title="Silences your mic while you key, so the tone cannot loop back."
          >
            <span className="truncate">Auto-mute mic</span>
            <Switch checked={micDucking} onChange={onMicDuckingChange} aria-label="Auto-mute mic while sending" />
          </label>
          {onPracticeModeChange && (
            <label
              className="flex min-w-0 flex-1 items-center justify-between gap-2 text-base"
              title="Tone plays in your headphones only. Nothing goes to the video app."
            >
              <span className="truncate">Practice mode</span>
              <Switch checked={practiceMode} onChange={onPracticeModeChange} aria-label="Practice mode" />
            </label>
          )}
          <Button size="sm" variant="secondary" icon={<VideoIcon />} onClick={onOpenVideoTips} className="shrink-0">
            Video app setup
          </Button>
        </div>

        <DecoderPanel
          cwText={cwText}
          onClear={onClearCwText}
          currentElements={currentElements}
          estimatedWpm={estimatedWpm}
          fill
        />
      </main>
    </div>
  );
}
