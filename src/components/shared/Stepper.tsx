import { MinusIcon, PlusIcon } from "./icons";

interface StepperProps {
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseLabel: string;
  increaseLabel: string;
  /** Width of the value cell, so the control never changes size. */
  valueWidth?: string;
}

export function Stepper({
  value,
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
  valueWidth = "w-16",
}: StepperProps) {
  const btn =
    "flex h-full w-8 items-center justify-center text-muted transition-colors hover:bg-surface3 hover:text-ink";
  return (
    <div className="inline-flex h-8 shrink-0 items-stretch overflow-hidden rounded border border-line-strong bg-surface2">
      <button type="button" onClick={onDecrease} aria-label={decreaseLabel} className={btn}>
        <MinusIcon />
      </button>
      <span className={`flex items-center justify-center text-base tabular-nums ${valueWidth}`}>{value}</span>
      <button type="button" onClick={onIncrease} aria-label={increaseLabel} className={btn}>
        <PlusIcon />
      </button>
    </div>
  );
}
