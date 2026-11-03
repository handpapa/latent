import { useState } from 'react';
import { HSL_BANDS, hslToRgb, type HslBand } from '../core/edit';
import { Slider, type SliderSpec } from './Slider';

const SPECS: SliderSpec[] = [
  { key: 'hsl-hue', label: '色相', min: -1, max: 1, step: 0.01, format: (v) => signed(v) },
  { key: 'hsl-sat', label: '饱和度', min: -1, max: 1, step: 0.01, format: (v) => signed(v) },
  { key: 'hsl-lum', label: '明度', min: -1, max: 1, step: 0.01, format: (v) => signed(v) },
];

const signed = (value: number): string => {
  const rounded = Math.round(value * 100);
  return rounded === 0 ? '0' : `${rounded > 0 ? '+' : ''}${rounded}`;
};

const swatch = (hue: number): string => {
  const [r, g, b] = hslToRgb(hue / 360, 0.62, 0.55);
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
};

interface HslSectionProps {
  bands: readonly HslBand[];
  onChange: (next: HslBand[], key: string) => void;
}

export function HslSection({ bands, onChange }: HslSectionProps): React.JSX.Element {
  const [active, setActive] = useState(1);
  const band = bands[active] ?? { hue: 0, saturation: 0, luminance: 0 };
  const set = (key: keyof HslBand, value: number): void => {
    onChange(
      bands.map((item, index) => (index === active ? { ...item, [key]: value } : item)),
      `hsl.${active}.${key}`,
    );
  };

  return (
    <div className="panel__group">
      <div className="bands" role="tablist" aria-label="颜色范围">
        {HSL_BANDS.map((item, index) => (
          <button
            key={item.name}
            type="button"
            role="tab"
            aria-selected={index === active}
            className="band"
            data-active={index === active}
            onClick={() => setActive(index)}
            title={item.name}
          >
            <span className="band__dot" style={{ background: swatch(item.hue) }} />
            <span className="band__name">{item.name}</span>
          </button>
        ))}
      </div>

      {SPECS.map((spec, index) => {
        const key: keyof HslBand = index === 0 ? 'hue' : index === 1 ? 'saturation' : 'luminance';
        return <Slider key={spec.key} control={spec} value={band[key]} onChange={(v) => set(key, v)} />;
      })}
    </div>
  );
}
