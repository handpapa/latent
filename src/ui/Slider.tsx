export interface SliderSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}

interface SliderProps {
  control: SliderSpec;
  value: number;
  onChange: (value: number) => void;
}

/** One control. Double-click returns it to zero — the same gesture as every
 *  other editor, and the only way to undo one slider without a reset button. */
export function Slider({ control, value, onChange }: SliderProps): React.JSX.Element {
  const id = `adjust-${control.key}`;
  return (
    <div className="slider">
      <div className="slider__head">
        <label className="slider__label" htmlFor={id}>
          {control.label}
        </label>
        <output className="slider__value" data-dirty={value !== 0}>
          {control.format(value)}
        </output>
      </div>
      <input
        id={id}
        className="slider__input"
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(0)}
      />
    </div>
  );
}

/** Strength is not an adjustment: it re-derives the parameters from neutral, so
 *  it lives with the preset panel rather than in the develop stack. */
export const STRENGTH: SliderSpec = {
  key: 'strength',
  label: '强度',
  min: 0,
  max: 1,
  step: 0.01,
  format: (value) => `${Math.round(value * 100)}`,
};
