export type BpmRangeSliderProps = {
  min: number;
  max: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  disabled?: boolean;
};

/**
 * Two overlapping range inputs with a filled segment between thumbs (styles in `pool-shell.css`).
 */
export function BpmRangeSlider({ min, max, low, high, onChange, disabled }: BpmRangeSliderProps) {
  const span = max - min;
  const lowPct = span > 0 ? ((low - min) / span) * 100 : 0;
  const highPct = span > 0 ? ((high - min) / span) * 100 : 100;

  return (
    <div className={`relative h-9 w-full min-w-[8rem] ${disabled ? "opacity-50" : ""}`}>
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
      <div
        className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/45"
        style={{
          left: `${lowPct}%`,
          width: `${Math.max(0, highPct - lowPct)}%`,
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={low}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(Math.min(v, high), high);
        }}
        className="bpm-range-slider-thumb absolute inset-0 z-[2] w-full cursor-pointer disabled:cursor-not-allowed"
        aria-label="Minimum BPM"
        aria-valuemin={min}
        aria-valuemax={high}
        aria-valuenow={low}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={high}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(low, Math.max(v, low));
        }}
        className="bpm-range-slider-thumb absolute inset-0 z-[1] w-full cursor-pointer disabled:cursor-not-allowed"
        aria-label="Maximum BPM"
        aria-valuemin={low}
        aria-valuemax={max}
        aria-valuenow={high}
      />
    </div>
  );
}
