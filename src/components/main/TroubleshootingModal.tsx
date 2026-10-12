import { ReactNode, useState } from "react";
import { Modal } from "../shared/Modal";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { ChevronDownIcon, ChevronRightIcon, HeadphonesIcon } from "../shared/icons";

interface TroubleshootingModalProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

interface Issue {
  question: string;
  answer: ReactNode;
}

const Bullets = ({ children }: { children: ReactNode }) => (
  <ul className="list-inside list-disc space-y-1">{children}</ul>
);

export function TroubleshootingModal({ onClose, onOpenSettings }: TroubleshootingModalProps) {
  const [open, setOpen] = useState<number | null>(0);

  const issues: Issue[] = [
    {
      question: "I hear the tone twice (echo or ghost tone)",
      answer: (
        <Bullets>
          <li>
            <strong className="text-ink">Put on headphones.</strong> This fixes it almost every time.
          </li>
          <li>Silence the adapter's speaker by holding the dit paddle for about 2 seconds.</li>
          <li>In Settings, set the sidetone to Adapter only so your computer speakers stay quiet.</li>
          <li>Turn on Auto-mute mic while sending, so no tone bleeds into your mic.</li>
        </Bullets>
      ),
    },
    {
      question: "Listeners can't hear my morse",
      answer: (
        <Bullets>
          <li>
            In Zoom, Teams, Discord or Meet, set the microphone to <em>Vail Zoomer Microphone</em> (Linux),{" "}
            <em>BlackHole 2ch</em> (Mac) or <em>CABLE Output</em> (Windows).
          </li>
          <li>The main screen should say "Sending to Zoom via" your virtual cable. If it says not installed, install it first.</li>
        </Bullets>
      ),
    },
    {
      question: "Listeners can't hear my voice",
      answer: (
        <Bullets>
          <li>Check that the mic meter moves when you talk.</li>
          <li>In Settings, check the right microphone is selected and the volume is not zero.</li>
          <li>Auto-mute only silences your mic while you key.</li>
        </Bullets>
      ),
    },
    {
      question: "Feedback or howling",
      answer: (
        <p>
          Wear headphones. If your speakers play the sidetone while your mic is listening, it loops. On Linux, also pick
          your speakers explicitly in Settings instead of the system default.
        </p>
      ),
    },
    {
      question: "Vail Adapter isn't detected",
      answer: (
        <Bullets>
          <li>Re-seat the USB cable at both ends.</li>
          <li>Try another USB port, ideally one directly on the computer.</li>
          <li>On Linux, unplug and replug. The kernel sometimes needs a moment to bind the MIDI interface.</li>
          <li>If a different MIDI device is listed, pick the right one in Settings.</li>
        </Bullets>
      ),
    },
    {
      question: "Tone sounds wrong or scratchy",
      answer: (
        <Bullets>
          <li>Use Tone on the main screen to change the pitch.</li>
          <li>Use Speed if dits and dahs feel too fast or slow for your keyer.</li>
          <li>If audio crackles, set Audio latency to Safe in Settings.</li>
        </Bullets>
      ),
    },
    {
      question: "Audio popped when I changed a setting",
      answer: <p>Changing an audio device briefly restarts the audio stream, which can pop. It is harmless.</p>,
    },
  ];

  return (
    <Modal
      title="Troubleshooting"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
          >
            Open Settings
          </Button>
          <Button variant="primary" size="md" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Callout tone="info" icon={<HeadphonesIcon />}>
          Most audio problems go away with headphones.
        </Callout>

        <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {issues.map((issue, i) => {
            const isOpen = open === i;
            return (
              <div key={issue.question}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex min-h-[2.2857rem] w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-base transition-colors hover:bg-surface2"
                >
                  <span className="font-medium">{issue.question}</span>
                  {isOpen ? <ChevronDownIcon className="text-muted" /> : <ChevronRightIcon className="text-muted" />}
                </button>
                {isOpen && <div className="px-3 pb-3 text-base text-muted">{issue.answer}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
