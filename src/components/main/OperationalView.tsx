import { useState } from "react";
import { BigSelect } from "../shared/BigSelect";

type TestRecordingState = "idle" | "recording" | "playing";

const KEYER_TYPES = [
  { value: "Straight", label: "Straight Key", description: "One paddle, you control all timing" },
  { value: "Bug", label: "Bug (auto dits)", description: "Automatic dits, manual dahs" },
  { value: "ElBug", label: "Electric Bug", description: "Like a bug with electronic timing" },
  { value: "SingleDot", label: "Single Dot Paddle", description: "One dit per squeeze" },
  { value: "Ultimatic", label: "Ultimatic Paddle", description: "Last paddle pressed wins" },
  { value: "PlainIambic", label: "Plain Iambic", description: "Alternating dits and dahs" },
  { value: "IambicA", label: "Iambic A", description: "Stops after completing element" },
  { value: "IambicB", label: "Iambic B", description: "Adds opposite element on release" },
  { value: "Keyahead", label: "Keyahead", description: "Buffers next element while sending" },
];

interface OperationalViewProps {
  // Status
  midiConnected: boolean;
  audioStarted: boolean;
  isKeyDown: boolean;
  estimatedWpm: number;

  // CW decoder
  cwText: string;
  onClearCwText: () => void;

  // Settings
  keyerType: string;
  wpm: number;
  sidetoneFrequency: number;
  sidetoneVolume: number;
  micVolume: number;
  micDucking: boolean;
  outputLevel: number;

  // Handlers
  onKeyerTypeChange: (type: string) => void;
  onWpmChange: (wpm: number) => void;
  onSidetoneFrequencyChange: (freq: number) => void;
  onSidetoneVolumeChange: (vol: number) => void;
  onMicVolumeChange: (vol: number) => void;
  onMicDuckingChange: (enabled: boolean) => void;
  onOpenVideoTips: () => void;
  onOpenSettings: () => void;
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
  cwText,
  onClearCwText,
  keyerType,
  wpm,
  sidetoneFrequency,
  sidetoneVolume,
  micVolume,
  micDucking,
  outputLevel,
  onKeyerTypeChange,
  onWpmChange,
  onSidetoneFrequencyChange,
  onSidetoneVolumeChange,
  onMicVolumeChange,
  onMicDuckingChange,
  onOpenVideoTips,
  onOpenSettings,
  onOpenHelp,
  testRecordingState,
  testRecordingCountdown,
  testPlaybackProgress,
  onStartTestRecording,
  onStopTestRecording,
  onStopTestPlayback,
}: OperationalViewProps) {
  const [showDecoder, setShowDecoder] = useState(true);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-amber-400">Vail Zoomer</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onOpenSettings}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
            title="Settings"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={onOpenHelp}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
            title="Help"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Status bar */}
      <div className="flex items-center gap-6 p-4 bg-gray-800 rounded-xl mb-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-4 h-4 rounded-full ${midiConnected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-lg">
            {midiConnected ? "Vail Adapter" : "No Key"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-4 h-4 rounded-full ${audioStarted ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-lg">Audio</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-4 h-4 rounded-full ${isKeyDown ? "bg-amber-400" : "bg-gray-600"}`}
          />
          <span className="text-lg">Key</span>
        </div>
        <div className="ml-auto text-2xl font-mono text-amber-400">
          {estimatedWpm > 0 ? `${estimatedWpm.toFixed(0)} WPM` : "-- WPM"}
        </div>
      </div>

      {/* Output level meter and test recording - what's going to Zoom */}
      <div className="p-4 bg-gray-800 rounded-xl mb-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm whitespace-nowrap">To Zoom:</span>
          <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                outputLevel > 0.8 ? "bg-red-500" : outputLevel > 0.5 ? "bg-amber-400" : "bg-green-500"
              }`}
              style={{ width: `${Math.min(outputLevel * 100, 100)}%` }}
            />
          </div>
          <span className="text-gray-400 text-sm w-12 text-right">
            {Math.round(outputLevel * 100)}%
          </span>
        </div>

        {/* Test Recording */}
        <div className="flex items-center gap-3">
          {testRecordingState === "idle" && (
            <button
              onClick={onStartTestRecording}
              disabled={!audioStarted}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
            >
              <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" />
              </svg>
              Test Recording
            </button>
          )}

          {testRecordingState === "recording" && (
            <>
              <div className="flex items-center gap-2 px-4 py-2 bg-red-900/50 border border-red-700 rounded-lg">
                <svg className="w-4 h-4 text-red-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8" />
                </svg>
                <span className="text-red-300 font-medium">
                  Recording... {testRecordingCountdown}
                </span>
              </div>
              <button
                onClick={onStopTestRecording}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
              >
                Stop
              </button>
            </>
          )}

          {testRecordingState === "playing" && (
            <>
              <div className="flex-1 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="text-green-300 text-sm">Playing...</span>
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
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
              >
                Stop
              </button>
            </>
          )}

          {testRecordingState === "idle" && (
            <span className="text-gray-500 text-xs">
              Record 5 seconds of mic + CW to test your setup
            </span>
          )}
        </div>
      </div>

      {/* CW Decoder - collapsible */}
      <div className="bg-gray-800 rounded-xl mb-4 overflow-hidden">
        <button
          onClick={() => setShowDecoder(!showDecoder)}
          className="w-full flex items-center justify-between p-4 text-lg font-medium hover:bg-gray-700/50 transition-colors"
        >
          <span>Decoded CW</span>
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
          <div className="px-4 pb-4">
            <div className="p-4 bg-black rounded-lg font-mono text-xl min-h-[80px] break-words">
              {cwText || <span className="text-gray-600">Waiting for CW...</span>}
            </div>
            <div className="flex justify-end mt-2">
              <button
                onClick={onClearCwText}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="bg-gray-800 rounded-xl p-4 mb-4 space-y-4">
        {/* Key type selector */}
        <div>
          <label className="block text-lg text-gray-300 mb-2">Key Type</label>
          <BigSelect
            value={keyerType}
            onChange={onKeyerTypeChange}
            options={KEYER_TYPES}
            placeholder="Select key type..."
          />
        </div>

        {/* Speed slider - only show if not straight key */}
        {keyerType !== "Straight" && (
          <div>
            <label className="flex justify-between items-center text-lg text-gray-300 mb-2">
              <span>Speed</span>
              <span className="text-amber-400 font-bold">{wpm} WPM</span>
            </label>
            <input
              type="range"
              min="5"
              max="50"
              value={wpm}
              onChange={(e) => onWpmChange(parseInt(e.target.value))}
              className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        )}

        {/* Tone pitch slider */}
        <div>
          <label className="flex justify-between items-center text-lg text-gray-300 mb-2">
            <span>Tone Pitch</span>
            <span className="text-amber-400 font-bold">{sidetoneFrequency} Hz</span>
          </label>
          <input
            type="range"
            min="400"
            max="1000"
            step="10"
            value={sidetoneFrequency}
            onChange={(e) => onSidetoneFrequencyChange(parseInt(e.target.value))}
            className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Sidetone volume slider */}
        <div>
          <label className="flex justify-between items-center text-lg text-gray-300 mb-2">
            <span>Tone Volume</span>
            <span className="text-amber-400 font-bold">{Math.round(sidetoneVolume * 100)}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(sidetoneVolume * 100)}
            onChange={(e) => onSidetoneVolumeChange(parseInt(e.target.value) / 100)}
            className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <p className="text-sm text-gray-500 mt-1">
            Use headphones to prevent feedback from your sidetone and others on the call.
          </p>
        </div>

        {/* Mic volume slider */}
        <div>
          <label className="flex justify-between items-center text-lg text-gray-300 mb-2">
            <span>Mic Volume</span>
            <span className="text-amber-400 font-bold">{Math.round(micVolume * 100)}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="150"
            value={Math.round(micVolume * 100)}
            onChange={(e) => onMicVolumeChange(parseInt(e.target.value) / 100)}
            className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Mic ducking toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-lg text-gray-300">Mute mic when sending</span>
            <p className="text-sm text-gray-500">
              Prevents sidetone from being picked up by your microphone
            </p>
          </div>
          <button
            onClick={() => onMicDuckingChange(!micDucking)}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              micDucking ? "bg-amber-500" : "bg-gray-600"
            }`}
          >
            <span
              className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${
                micDucking ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Video App Tips button */}
      <div className="mt-auto pt-4">
        <button
          onClick={onOpenVideoTips}
          className="w-full p-4 bg-blue-900/50 hover:bg-blue-900/70 border border-blue-700 rounded-xl text-lg text-blue-300 transition-colors"
        >
          Video App Tips (Zoom, Teams, Discord)
        </button>
      </div>
    </div>
  );
}
