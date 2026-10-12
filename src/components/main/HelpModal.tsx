import { Modal } from "../shared/Modal";
import { Button } from "../shared/Button";

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <Modal
      title="Help"
      size="sm"
      onClose={onClose}
      footer={
        <Button variant="primary" size="md" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <div className="space-y-3 text-base">
        <p>
          Vail Zoomer mixes your microphone with your morse sidetone and sends both to Zoom, Teams, Discord or Meet, so
          the other side hears your voice and your CW.
        </p>
        <ul className="list-inside list-disc space-y-1.5 text-muted">
          <li>
            <span className="text-ink">Press your key.</span> The lamp on the main screen lights up.
          </li>
          <li>
            <span className="text-ink">Test recording</span> plays back what your video app will hear.
          </li>
          <li>
            <span className="text-ink">Settings</span> has devices, speed, tone and display options.
          </li>
          <li>
            <span className="text-ink">Video app setup</span> shows the per-app microphone settings.
          </li>
          <li>Click a status chip to jump to Settings.</li>
        </ul>
      </div>
    </Modal>
  );
}
