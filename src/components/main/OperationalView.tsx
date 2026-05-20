import { useEffect, useRef, useState } from "react";
import { AppIcon } from "../shared/AppIcon";
import { Card } from "../shared/Card";
import { friendlyMidiName } from "../audio/audioHelpers";

// Mirror of the keyer list used by SettingsSheet / Step1, kept compact for
// the in-app quick picker — same value strings so the backend doesn't care
// which surface set it.
const QUICK_KEYER_TYPES: { value: string; label: string }[] = [
  { value: "Straight", label: "Straight Key" },
  { value: "Bug", label: "Bug" },
  { value: "ElBug", label: "Electric Bug" },
  { value: "SingleDot", label: "Single Dot" },
  { value: "Ultimatic", label: "Ultimatic" },
  { value: "PlainIambic", label: "Plain Iambic" },
  { value: "IambicA", label: "Iambic A" },
  { value: "IambicB", label: "Iambic B" },
  { value: "Keyahead", label: "Keyahead" },
];

type TestRecordingState = "idle" | "recording" | "playing";

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

  // Sidetone routing — used to surface the "computer speakers" device on the
  // status row when the user has the tone routed to both adapter + computer.
  sidetoneRoute: string;
  selectedLocalDevice: string | null;
  outputDevices: { display_name: string; internal_name: string }[];

  // Quick controls — slim row above decoded morse
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
}: OperationalViewProps) {
  const [showDecoder, setShowDecoder] = useState(true);

  // Track time since last key event so we can show "Press your key to test"
  // when the operator is idle, but hide the prompt once they're actively
  // sending.
  const [recentlyKeyed, setRecentlyKeyed] = useState(false);
  const idleTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (isKeyDown) {
      setRecentlyKeyed(true);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    } else if (recentlyKeyed) {
      idleTimerRef.current = window.setTimeout(() => setRecentlyKeyed(false), 4000);
    }
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isKeyDown]);

  // Friendly current-mic label for the status row.
  const micLabel = (() => {
    if (!audioStarted) return "Audio off";
    if (!selectedInputDevice) return "No mic selected";
    const match = inputDevices.find((d) => d.internal_name === selectedInputDevice);
    return match ? match.display_name : "Mic ready";
  })();

  const keyerLabel = midiConnected
    ? selectedMidiDevice
      ? friendlyMidiName(selectedMidiDevice)
      : "Vail Adapter ready"
    : "No Vail Adapter detected";

  // Human-readable name for the local sidetone device, used by the "Tone to"
  // chip when the user has routed sidetone to both adapter and computer.
  const toneOutputLabel = (() => {
    if (!selectedLocalDevice) return "Not selected";
    const match = outputDevices.find((d) => d.internal_name === selectedLocalDevice);
    return match ? match.display_name : selectedLocalDevice;
  })();

  return (
    <div className="min-h-screen text-white px-4 py-3 flex flex-col gap-2.5">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AppIcon size={28} />
          <h1 className="text-xl font-bold text-amber-400">Vail Zoomer</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onOpenSettings}
            className="min-h-[40px] min-w-[40px] p-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
            title="Settings"
            aria-label="Open settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={onOpenTroubleshoot}
            className="min-h-[40px] px-3 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center gap-1.5 text-sm text-gray-200"
            title="Troubleshooting"
            aria-label="Open troubleshooting"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
            Troubleshoot
          </button>
          <button
            onClick={onOpenHelp}
            className="min-h-[40px] min-w-[40px] p-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
            title="Help"
            aria-label="Open help"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Persistent headphones reminder — single biggest source of audio confusion */}
      <button
        onClick={onOpenTroubleshoot}
        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-left transition-colors"
        title="Open troubleshooting"
      >
        <svg className="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3a9 9 0 00-9 9v7a2 2 0 002 2h3v-8H5v-1a7 7 0 0114 0v1h-3v8h3a2 2 0 002-2v-7a9 9 0 00-9-9z" />
        </svg>
        <span className="text-sm text-amber-100">
          <strong>Wear headphones</strong> — stops mic-pickup of the tone, prevents feedback, and fixes most audio weirdness.
        </span>
      </button>

      {/* Status row — clickable chips + WPM. The keyer chip carries a small
          live dot so visual feedback for each dit/dah is right next to the
          device name instead of competing in its own column. */}
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors ${
              midiConnected ? "hover:bg-gray-700/50" : "bg-red-900/30 hover:bg-red-900/50"
            }`}
            title="Open settings"
          >
            <span
              className={`inline-block w-3 h-3 rounded-full ${
                midiConnected ? "bg-green-500" : "bg-red-500"
              } ${midiConnected ? "" : "animate-pulse"}`}
            />
            <span className="text-sm font-medium text-left leading-tight">
              <span className="block text-xs text-gray-400">Keyer</span>
              <span className="block truncate max-w-[180px]">{keyerLabel}</span>
            </span>
            {/* Live key dot — small, attached to the keyer chip */}
            <span
              className={`inline-block w-3.5 h-3.5 rounded-full border transition-all duration-75 ${
                isKeyDown
                  ? "bg-amber-400 border-amber-300 shadow-[0_0_6px_2px_rgba(251,191,36,0.6)]"
                  : recentlyKeyed
                  ? "bg-amber-700/60 border-amber-600"
                  : "bg-gray-700 border-gray-600"
              }`}
              title={isKeyDown ? "Key down" : "Key up"}
              aria-label={isKeyDown ? "Key down" : "Key up"}
            />
          </button>

          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
              audioStarted ? "hover:bg-gray-700/50" : "bg-red-900/30 hover:bg-red-900/50"
            }`}
            title="Open settings"
          >
            <span
              className={`inline-block w-3 h-3 rounded-full ${
                audioStarted ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-sm font-medium text-left leading-tight">
              <span className="block text-xs text-gray-400">Mic</span>
              <span className="block truncate max-w-[180px]">{micLabel}</span>
            </span>
          </button>

          {/* Local tone monitor chip — only appears when the user has the
              tone routed to both adapter and computer. Clearly labeled as
              local monitoring so it can't be mistaken for the Zoom route. */}
          {sidetoneRoute === "Both" && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-700/50 transition-colors"
              title="Local computer-speaker monitoring. Open settings to change."
            >
              <svg className="w-3.5 h-3.5 text-amber-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              <span className="text-sm font-medium text-left leading-tight">
                <span className="block text-xs text-gray-400">Tone monitor (you only)</span>
                <span className="block truncate max-w-[180px]">{toneOutputLabel}</span>
              </span>
            </button>
          )}

          <div className="ml-auto text-xl font-mono text-amber-400 pr-1" aria-live="polite">
            {estimatedWpm > 0 ? `${estimatedWpm.toFixed(0)} WPM` : "—"}
          </div>
        </div>
      </Card>

      {/* Mute mic while keying — prominent, on the main page */}
      <Card padded={false}>
        <button
          onClick={() => onMicDuckingChange(!micDucking)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl hover:bg-gray-700/30 transition-colors text-left"
          aria-pressed={micDucking}
        >
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-gray-100">
              Auto-mute mic while sending
            </p>
            <p className="text-sm text-gray-400">
              Mutes your microphone the instant you key down and unmutes it the moment you stop — prevents your sidetone bouncing back as feedback.
            </p>
          </div>
          <span
            className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
              micDucking ? "bg-amber-500" : "bg-gray-600"
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                micDucking ? "left-[22px]" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </Card>

      {/* Live audio — signal flow diagram */}
      <Card>
        <h3 className="text-base font-semibold text-gray-200 mb-3">Live audio</h3>

        <div className="flex items-stretch gap-2">
          {/* Mic */}
          <div className="flex-1 bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 text-gray-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z" />
              </svg>
              <span className="text-sm font-medium">Your mic</span>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  micLevel > 0.8 ? "bg-red-500" : micLevel > 0.5 ? "bg-amber-400" : "bg-green-500"
                }`}
                style={{ width: `${Math.min(micLevel * 100, 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 tabular-nums">{Math.round(micLevel * 100)}%</span>
          </div>

          {/* Arrow */}
          <div className="flex items-center text-gray-500 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>

          {/* Vail Adapter — key indicator */}
          <div className="flex-1 bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-300 text-center leading-tight">
              Vail Adapter
            </span>
            <div
              className={`w-7 h-7 rounded-full border-2 transition-all duration-75 flex items-center justify-center ${
                isKeyDown
                  ? "bg-amber-500 border-amber-400 shadow-md shadow-amber-500/50"
                  : "bg-gray-700 border-gray-600"
              }`}
            >
              <span
                className={`text-base font-bold leading-none ${
                  isKeyDown ? "text-gray-900" : "text-gray-500"
                }`}
              >
                {isKeyDown ? "●" : "○"}
              </span>
            </div>
            <span className={`text-xs ${isKeyDown ? "text-amber-400" : "text-gray-500"}`}>
              {isKeyDown ? "keying" : "idle"}
            </span>
          </div>

          {/* Arrow */}
          <div className="flex items-center text-gray-500 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>

          {/* Zoom output — merged signal */}
          <div className="flex-1 bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 text-gray-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-medium">To video app</span>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  outputLevel > 0.8 ? "bg-red-500" : outputLevel > 0.5 ? "bg-amber-400" : "bg-green-500"
                }`}
                style={{ width: `${Math.min(outputLevel * 100, 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 tabular-nums">{Math.round(outputLevel * 100)}%</span>
          </div>
        </div>

        {/* Test recording — compact */}
        <div className="border-t border-gray-700 mt-3 pt-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-400 flex-1 min-w-[180px]">
            Record 5 s and play it back to hear what Zoom hears.
          </span>
          {testRecordingState === "idle" && (
            <button
              onClick={onStartTestRecording}
              disabled={!audioStarted}
              className="flex items-center gap-2 min-h-[40px] px-4 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" />
              </svg>
              Test recording
            </button>
          )}

          {testRecordingState === "recording" && (
            <>
              <div className="flex items-center gap-2 min-h-[40px] px-3 bg-red-900/40 border border-red-700 rounded-lg">
                <svg className="w-4 h-4 text-red-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8" />
                </svg>
                <span className="text-red-200 text-sm font-medium">
                  Recording… {testRecordingCountdown}
                </span>
              </div>
              <button
                onClick={onStopTestRecording}
                className="min-h-[40px] px-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
              >
                Stop
              </button>
            </>
          )}

          {testRecordingState === "playing" && (
            <>
              <div className="flex items-center gap-2 min-w-[180px]">
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span className="text-green-300 text-sm font-medium">Playing…</span>
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden min-w-[80px]">
                  <div
                    className="h-full bg-green-500 transition-all duration-100"
                    style={{ width: `${testPlaybackProgress * 100}%` }}
                  />
                </div>
              </div>
              <button
                onClick={onStopTestPlayback}
                className="min-h-[40px] px-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </Card>

      {/* Quick controls — change keyer / WPM / tone without opening Settings */}
      <Card padded={false}>
        <div className="flex items-center gap-3 px-3 py-2 flex-wrap">
          {/* Key type */}
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-400 whitespace-nowrap">Key</span>
            <div className="relative">
              <select
                value={keyerType}
                onChange={(e) => onKeyerTypeChange(e.target.value)}
                className="appearance-none bg-gray-700 border-2 border-gray-600 rounded-lg text-sm text-gray-100 pl-3 pr-8 py-1.5 hover:border-gray-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/40 cursor-pointer transition-colors"
                aria-label="Key type"
              >
                {QUICK_KEYER_TYPES.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </label>

          {/* WPM stepper */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 whitespace-nowrap">Speed</span>
            <div className="inline-flex items-stretch rounded-lg border-2 border-gray-600 bg-gray-700 overflow-hidden">
              <button
                onClick={() => onWpmChange(Math.max(5, wpm - 1))}
                className="w-8 text-lg font-semibold text-gray-200 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 transition-colors border-r border-gray-600 leading-none"
                aria-label="Decrease WPM"
              >
                −
              </button>
              <span className="tabular-nums text-sm font-medium text-gray-100 w-16 text-center self-center px-1">
                {wpm} WPM
              </span>
              <button
                onClick={() => onWpmChange(Math.min(50, wpm + 1))}
                className="w-8 text-lg font-semibold text-gray-200 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 transition-colors border-l border-gray-600 leading-none"
                aria-label="Increase WPM"
              >
                +
              </button>
            </div>
          </div>

          {/* Tone stepper (Hz) */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 whitespace-nowrap">Tone</span>
            <div className="inline-flex items-stretch rounded-lg border-2 border-gray-600 bg-gray-700 overflow-hidden">
              <button
                onClick={() => onSidetoneFrequencyChange(Math.max(300, sidetoneFrequency - 25))}
                className="w-8 text-lg font-semibold text-gray-200 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 transition-colors border-r border-gray-600 leading-none"
                aria-label="Lower tone"
              >
                −
              </button>
              <span className="tabular-nums text-sm font-medium text-gray-100 w-16 text-center self-center px-1">
                {sidetoneFrequency} Hz
              </span>
              <button
                onClick={() => onSidetoneFrequencyChange(Math.min(1200, sidetoneFrequency + 25))}
                className="w-8 text-lg font-semibold text-gray-200 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 transition-colors border-l border-gray-600 leading-none"
                aria-label="Raise tone"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Decoded morse — collapsible */}
      <Card padded={false}>
        <button
          onClick={() => setShowDecoder((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-base font-medium text-gray-200 hover:text-white rounded-lg"
          aria-expanded={showDecoder}
        >
          <span>Decoded morse</span>
          <svg
            className={`w-4 h-4 transition-transform ${showDecoder ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showDecoder && (
          <div className="px-3 pb-3">
            <div className="p-3 bg-black rounded-lg font-mono text-lg min-h-[64px] max-h-[140px] overflow-y-auto break-words leading-relaxed">
              {cwText || <span className="text-gray-500">Waiting for morse…</span>}
            </div>
            {cwText && (
              <div className="flex justify-end mt-2">
                <button
                  onClick={onClearCwText}
                  className="min-h-[36px] px-3 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Footer — video app tips */}
      <div className="mt-auto pt-1">
        <button
          onClick={onOpenVideoTips}
          className="w-full min-h-[48px] px-4 py-2.5 bg-blue-900/40 hover:bg-blue-900/60 border-2 border-blue-700/60 rounded-xl text-base text-blue-200 font-medium transition-colors"
        >
          Set up Zoom / Teams / Discord / Meet →
        </button>
      </div>
    </div>
  );
}
