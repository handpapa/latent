import { COLOR_CONTROLS, LIGHT_CONTROLS, type AdjustParams } from '../core/adjust';
import { Slider } from './Slider';

interface AdjustSectionProps {
  params: AdjustParams;
  onChange: (next: AdjustParams, key: string) => void;
}

export function AdjustSection({ params, onChange }: AdjustSectionProps): React.JSX.Element {
  return (
    <>
      <div className="panel__group">
        <h3 className="panel__label">光影</h3>
        {LIGHT_CONTROLS.map((control) => (
          <Slider
            key={control.key}
            control={control}
            value={params[control.key]}
            onChange={(value) => onChange({ ...params, [control.key]: value }, control.key)}
          />
        ))}
      </div>

      <div className="panel__group">
        <h3 className="panel__label">颜色</h3>
        {COLOR_CONTROLS.map((control) => (
          <Slider
            key={control.key}
            control={control}
            value={params[control.key]}
            onChange={(value) => onChange({ ...params, [control.key]: value }, control.key)}
          />
        ))}
      </div>
    </>
  );
}
