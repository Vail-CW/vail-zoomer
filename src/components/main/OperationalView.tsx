import { useEffect, useRef, useState } from "react";
import { AppIcon } from "../shared/AppIcon";
import { Card } from "../shared/Card";
import { KeyIndicator } from "../shared/KeyIndicator";

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

  // Handlers
  onOpenSettings: () => void;
  onOpenVideoTips: () => void;
  onOpenHelp: () => void;

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
  onOpenSettings,
  onOpenVideoTips,
  onOpenHelp,
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
    ? selectedMidiDevice ?? "Keyer ready"
    : "Keyer not detected";

  return (
    <div className="min-h-screen text-white p-5 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <AppIcon size={36} />
          <h1 className="text-2xl font-bold text-amber-400">Vail Zoomer</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onOpenSettings}
            className="min-h-[48px] min-w-[48px] p-3 bg-gray-800 hover:bg-gray-700 rounded-xl"
            title="Settings"
            aria-label="Open settings"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={onOpenHelp}
            className="min-h-[48px] min-w-[48px] p-3 bg-gray-800 hover:bg-gray-700 rounded-xl"
            title="Help"
            aria-label="Open help"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Status row — clickable chips that jump to Settings when something's wrong */}
      <Card className="mb-4" padded={false}>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors min-h-[48px] ${
              midiConnected ? "hover:bg-gray-700/50" : "bg-red-900/30 hover:bg-red-900/50"
            }`}
            title="Open settings"
          >
            <span
              className={`inline-block w-4 h-4 rounded-full ${
                midiConnected ? "bg-green-500" : "bg-red-500"
              } ${midiConnected ? "" : "animate-pulse"}`}
            />
            <span className="text-base font-medium text-left">
              <span className="block text-sm text-gray-300">Keyer</span>
              <span className="block truncate max-w-[200px]">{keyerLabel}</span>
            </span>
          </button>

          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors min-h-[48px] ${
              audioStarted ? "hover:bg-gray-700/50" : "bg-red-900/30 hover:bg-red-900/50"
            }`}
            title="Open settings"
          >
            <span
              className={`inline-block w-4 h-4 rounded-full ${
                audioStarted ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-base font-medium text-left">
              <span className="block text-sm text-gray-300">Mic</span>
              <span className="block truncate max-w-[200px]">{micLabel}</span>
            </span>
          </button>

          <div className="ml-auto text-2xl font-mono text-amber-400 pr-1" aria-live="polite">
            {estimatedWpm > 0 ? `${estimatedWpm.toFixed(0)} WPM` : "—"}
          </div>
        </div>
      </Card>

      {/* Key + decoded text — front and center */}
      <Card className="mb-4">
        <div className="flex flex-col items-center gap-3">
          <KeyIndicator
            isKeyDown={isKeyDown}
            label={isKeyDown ? "Sending…" : recentlyKeyed ? "Got it" : "Press your key to test"}
            hint={
              midiConnected && !recentlyKeyed
                ? "The circle lights up when the app receives your key"
                : undefined
            }
          />
        </div>

        {/* Decoded CW */}
        <button
          onClick={() => setShowDecoder((v) => !v)}
          className="mt-3 w-full flex items-center justify-between px-2 py-1 text-base font-medium text-gray-200 hover:text-white rounded-lg"
          aria-expanded={showDecoder}
        >
          <span>Decoded morse</span>
          <svg
            className={`w-5 h-5 transition-transform ${showDecoder ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showDecoder && (
          <div className="mt-2">
            <div className="p-4 bg-black rounded-xl font-mono text-2xl min-h-[100px] break-words leading-relaxed">
              {cwText || <span className="text-gray-500">Waiting for morse…</span>}
            </div>
            {cwText && (
              <div className="flex justify-end mt-2">
                <button
                  onClick={onClearCwText}
                  className="min-h-[44px] px-4 text-base bg-gray-700 hover:bg-gray-600 rounded-lg"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Live meters + test recording */}
      <Card className="mb-4">
        <h3 className="text-lg font-semibold text-gray-200 mb-3">Live audio</h3>

        {/* Mic meter */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-base text-gray-300 w-24 shrink-0">Your mic</span>
          <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                micLevel > 0.8 ? "bg-red-500" : micLevel > 0.5 ? "bg-amber-400" : "bg-green-500"
              }`}
              style={{ width: `${Math.min(micLevel * 100, 100)}%` }}
            />
          </div>
          <span className="text-base text-gray-300 w-12 text-right tabular-nums">
            {Math.round(micLevel * 100)}%
          </span>
        </div>

        {/* Output meter */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-base text-gray-300 w-24 shrink-0">To Zoom</span>
          <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                outputLevel > 0.8 ? "bg-red-500" : outputLevel > 0.5 ? "bg-amber-400" : "bg-green-500"
              }`}
              style={{ width: `${Math.min(outputLevel * 100, 100)}%` }}
            />
          </div>
          <span className="text-base text-gray-300 w-12 text-right tabular-nums">
            {Math.round(outputLevel * 100)}%
          </span>
        </div>

        {/* Test recording */}
        <div className="border-t border-gray-700 pt-4">
          <p className="text-base text-gray-300 mb-2">
            Record yourself for 5 s, then play it back to hear what Zoom will hear.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {testRecordingState === "idle" && (
              <button
                onClick={onStartTestRecording}
                disabled={!audioStarted}
                className="flex items-center gap-2 min-h-[48px] px-5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-base font-medium transition-colors"
              >
                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8" />
                </svg>
                Start test recording
              </button>
            )}

            {testRecordingState === "recording" && (
              <>
                <div className="flex items-center gap-2 min-h-[48px] px-4 bg-red-900/40 border border-red-700 rounded-lg">
                  <svg className="w-5 h-5 text-red-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                  <span className="text-red-200 text-base font-medium">
                    Recording… {testRecordingCountdown}
                  </span>
                </div>
                <button
                  onClick={onStopTestRecording}
                  className="min-h-[48px] px-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-base"
                >
                  Stop
                </button>
              </>
            )}

            {testRecordingState === "playing" && (
              <>
                <div className="flex-1 flex items-center gap-3 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span className="text-green-300 text-base font-medium">Playing…</span>
                  </div>
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-100"
                      style={{ width: `${testPlaybackProgress * 100}%` }}
                    />
                  </div>
                </div>
                <button
                  onClick={onStopTestPlayback}
                  className="min-h-[48px] px-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-base"
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Footer — video app tips */}
      <div className="mt-auto pt-2">
        <button
          onClick={onOpenVideoTips}
          className="w-full min-h-[60px] p-4 bg-blue-900/40 hover:bg-blue-900/60 border-2 border-blue-700/60 rounded-2xl text-lg text-blue-200 font-medium transition-colors"
        >
          Set up Zoom / Teams / Discord / Meet →
        </button>
      </div>
    </div>
  );
}
