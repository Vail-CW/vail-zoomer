import { useRef } from "react";
import { BigButton } from "../shared/BigButton";
import { InfoBox } from "../shared/InfoBox";
import { useModalA11y } from "../../hooks/useModalA11y";

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(panelRef, onClose);

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="help-modal-title" className="text-2xl font-bold text-amber-400">
            Help
          </h2>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] text-gray-300 hover:text-white text-3xl leading-none"
            aria-label="Close help"
          >
            &times;
          </button>
        </div>
        <div className="space-y-4 text-base text-gray-200">
          <p>
            <strong className="text-white">Vail Zoomer</strong> mixes your microphone with
            morse-code sidetone and sends both to Zoom, Teams, Discord, or Meet — so the
            other side hears your voice <em>and</em> your CW.
          </p>
          <div className="space-y-2">
            <p className="font-medium text-white">Quick tips:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Press your Vail Adapter key — the circle on the main screen lights up.</li>
              <li>
                Use <strong>Start test recording</strong> to hear exactly what Zoom will hear.
              </li>
              <li>
                Tap the <strong>gear icon</strong> to pick devices, change speed, or change
                the tone.
              </li>
              <li>
                Tap <strong>Set up Zoom / Teams / Discord / Meet</strong> for the per-app
                settings.
              </li>
            </ul>
          </div>
          <InfoBox variant="info">
            <p>
              If a status chip turns red, tap it to jump straight to Settings and fix it.
            </p>
          </InfoBox>
        </div>
        <div className="mt-6 flex justify-end">
          <BigButton onClick={onClose} className="!min-h-[52px] !py-3">
            Got it
          </BigButton>
        </div>
      </div>
    </div>
  );
}
