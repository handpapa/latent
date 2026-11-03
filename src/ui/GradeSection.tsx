import { hslToRgb, type Grade, type GradeZone } from '../core/edit';
import { Slider, type SliderSpec } from './Slider';

const HUE: SliderSpec = {
  key: 'grade-hue',
  label: '色相',
  min: 0,
  max: 360,
  step: 1,
  format: (v) => `${Math.round(v)}°`,
};

const SATURATION: SliderSpec = {
  key: 'grade-sat',
  label: '着色',
  min: 0,
  max: 1,
  step: 0.01,
  format: (v) => `${Math.round(v * 100)}`,
};

const ZONES = [
  { key: 'shadows', label: '阴影' },
  { key: 'midtones', label: '中间调' },
  { key: 'highlights', label: '高光' },
] as const;

const tint = (zone: GradeZone): string => {
  if (zone.saturation <= 0.001) return 'var(--raised)';
  const mix = Math.min(1, zone.saturation * 2);
  const [r, g, b] = hslToRgb(zone.hue / 360, 0.7, 0.5);
  const blend = (channel: number): number => Math.round((channel * mix + 0.3 * (1 - mix)) * 255);
  return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
};

interface GradeSectionProps {
  grade: Grade;
  onChange: (next: Grade, key: string) => void;
}

export function GradeSection({ grade, onChange }: GradeSectionProps): React.JSX.Element {
  const set = (key: (typeof ZONES)[number]['key'], next: Partial<GradeZone>): void => {
    onChange({ ...grade, [key]: { ...grade[key], ...next } }, `grade.${key}.${Object.keys(next)[0]}`);
  };

  return (
    <>
      {ZONES.map((zone) => (
        <div className="panel__group" key={zone.key}>
          <div className="panel__row">
            <h3 className="panel__label">{zone.label}</h3>
            <span className="grade__swatch" style={{ background: tint(grade[zone.key]) }} />
          </div>
          <Slider
            control={{ ...HUE, key: `${zone.key}-hue` }}
            value={grade[zone.key].hue}
            onChange={(value) => set(zone.key, { hue: value })}
          />
          <Slider
            control={{ ...SATURATION, key: `${zone.key}-sat` }}
            value={grade[zone.key].saturation}
            onChange={(value) => set(zone.key, { saturation: value })}
          />
        </div>
      ))}
    </>
  );
}
