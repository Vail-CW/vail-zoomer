import { useRef, useState } from "react";
import { BigButton } from "../shared/BigButton";
import { InfoBox } from "../shared/InfoBox";
import { useModalA11y } from "../../hooks/useModalA11y";

interface TroubleshootingModalProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

interface Issue {
  question: string;
  answer: React.ReactNode;
}

export function TroubleshootingModal({ onClose, onOpenSettings }: TroubleshootingModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(panelRef, onClose);
  const [open, setOpen] = useState<number | null>(0);

  const issues: Issue[] = [
    {
      question: "I hear the morse tone twice in my recording (echo / ghost tone)",
      answer: (
        <>
          <p>
            Almost always caused by your microphone picking up <em>another</em> tone in the
            room — either the Vail Adapter's onboard buzzer or your laptop speakers.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
            <li>
              <strong className="text-amber-300">Put on headphones.</strong> This solves it
              99% of the time. Mic can't catch tones it can't hear.
            </li>
            <li>
              Silence the Vail Adapter's built-in speaker by holding the dit paddle for
              ~2 seconds.
            </li>
            <li>
              In Settings, set <strong>Where do you want to hear your sidetone?</strong>{" "}
              to <em>Adapter only</em> so your laptop speakers don't play the tone too.
            </li>
            <li>
              Turn on <strong>Auto-mute mic while sending</strong> on the main screen — the
              mic drops to zero while you're keying so no bleed gets through.
            </li>
          </ul>
        </>
      ),
    },
    {
      question: "Listeners can't hear my morse (no tone reaches Zoom / Teams / Discord)",
      answer: (
        <>
          <p>
            The video app needs to be listening to the Vail virtual microphone, not your real
            mic.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
            <li>
              In Zoom/Teams/Discord/Meet, change <strong>Microphone</strong> to{" "}
              <em>Vail Zoomer Microphone</em> (Linux), <em>BlackHole 2ch</em> (Mac), or{" "}
              <em>CABLE Output</em> (Windows).
            </li>
            <li>
              In Vail Zoomer's Settings, make sure <strong>Output to your video app</strong>{" "}
              is set to the matching virtual device.
            </li>
          </ul>
        </>
      ),
    },
    {
      question: "Listeners can't hear my voice",
      answer: (
        <>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Confirm the mic level meter on the main screen moves when you talk.</li>
            <li>
              Open Settings — check the right microphone is selected and that mic volume
              isn't at zero.
            </li>
            <li>
              If you toggled <strong>Auto-mute mic while sending</strong> on, that only
              mutes <em>while you key</em> — voice still goes through the rest of the time.
            </li>
          </ul>
        </>
      ),
    },
    {
      question: "I'm getting feedback or howling",
      answer: (
        <>
          <p className="mb-2">
            <strong className="text-amber-300">Wear headphones.</strong> If your speakers are
            playing the sidetone while your mic is listening, it loops.
          </p>
          <p>
            On Linux, also check that your computer-speakers output is set explicitly (not
            "system default") so the audio engine never accidentally falls back to a
            misconfigured device.
          </p>
        </>
      ),
    },
    {
      question: "Vail Adapter isn't detected",
      answer: (
        <>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Re-seat the USB cable on both ends.</li>
            <li>Try a different USB port (preferably one straight to the computer).</li>
            <li>
              On Linux, unplug/replug — the kernel sometimes needs a beat to bind the MIDI
              interface.
            </li>
            <li>
              If a different MIDI device is listed, open Settings → tap the keyer chip and
              pick the right one manually.
            </li>
          </ul>
        </>
      ),
    },
    {
      question: "Tone sounds wrong — too high, too low, or scratchy",
      answer: (
        <>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              Use the <strong>Tone</strong> quick controls on the main screen to nudge the
              frequency.
            </li>
            <li>
              Use the <strong>Speed</strong> control if dits/dahs sound too fast or slow for
              the keyer type.
            </li>
            <li>
              If audio sounds glitchy/crackly, open Settings and switch{" "}
              <strong>Output to your video app</strong> off and back on to reset the audio
              stream.
            </li>
          </ul>
        </>
      ),
    },
    {
      question: "Audio popped or glitched between screens",
      answer: (
        <>
          <p>
            When the app changes audio devices it briefly stops and re-opens the audio
            stream. Your headphones / OS sometimes pop during that gap. It's harmless and
            only happens when you actually change a device.
          </p>
        </>
      ),
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="troubleshooting-modal-title"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 id="troubleshooting-modal-title" className="text-2xl font-bold text-amber-400">
            Troubleshooting
          </h2>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] text-gray-300 hover:text-white text-3xl leading-none"
            aria-label="Close troubleshooting"
          >
            &times;
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-3">
          <InfoBox variant="info">
            <p>
              <strong className="text-amber-300">Tip:</strong> Most audio weirdness goes away
              the moment you put on headphones. Your microphone can't pick up what your
              speakers aren't playing.
            </p>
          </InfoBox>

          {issues.map((issue, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className="border border-gray-700 rounded-xl overflow-hidden bg-gray-900/40"
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-700/30 transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="text-base font-medium text-gray-100">
                    {issue.question}
                  </span>
                  <svg
                    className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-base text-gray-200 leading-relaxed">
                    {issue.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="min-h-[44px] px-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-base text-gray-100"
          >
            Open Settings
          </button>
          <BigButton onClick={onClose} className="!min-h-[48px] !py-2.5">
            Done
          </BigButton>
        </div>
      </div>
    </div>
  );
}
