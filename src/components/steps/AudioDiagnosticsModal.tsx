import { Modal } from "../shared/Modal";
import { Button } from "../shared/Button";
import { CopyIcon } from "../shared/icons";

interface AudioDiagnosticsModalProps {
  diagText: string;
  diagLoading: boolean;
  diagCopied: boolean;
  onCopy: () => void;
  onClose: () => void;
}

export function AudioDiagnosticsModal({
  diagText,
  diagLoading,
  diagCopied,
  onCopy,
  onClose,
}: AudioDiagnosticsModalProps) {
  return (
    <Modal
      title="Audio diagnostics"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={<CopyIcon />} onClick={onCopy} disabled={diagLoading || !diagText}>
            {diagCopied ? "Copied" : "Copy for developer"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        Every audio device on this system, including ones Vail Zoomer hides. If your mic is missing, copy this and
        send it to the developers.
      </p>
      {diagLoading ? (
        <p className="text-base text-muted">Collecting...</p>
      ) : (
        <pre className="whitespace-pre-wrap rounded border border-line bg-app p-3 font-mono text-sm">{diagText}</pre>
      )}
    </Modal>
  );
}
