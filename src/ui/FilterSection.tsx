import { useRef, useState } from 'react';
import type { EditState } from '../core/edit';
import { Slider, type SliderSpec } from './Slider';

const INTENSITY: SliderSpec = {
  key: 'lut-intensity',
  label: '滤镜强度',
  min: 0,
  max: 1,
  step: 0.01,
  format: (v) => `${Math.round(v * 100)}`,
};

const GRAIN: SliderSpec = {
  key: 'grain',
  label: '颗粒',
  min: 0,
  max: 1,
  step: 0.01,
  format: (v) => `${Math.round(v * 100)}`,
};

const CLARITY: SliderSpec = {
  key: 'clarity',
  label: '清晰度',
  min: 0,
  max: 1,
  step: 0.01,
  format: (v) => `${Math.round(v * 100)}`,
};

const GLOW: SliderSpec = {
  key: 'glow',
  label: '辉光',
  min: 0,
  max: 1,
  step: 0.01,
  format: (v) => `${Math.round(v * 100)}`,
};

const SOFTNESS: SliderSpec = {
  key: 'softness',
  label: '柔焦',
  min: 0,
  max: 1,
  step: 0.01,
  format: (v) => `${Math.round(v * 100)}`,
};

const VIGNETTE: SliderSpec = {
  key: 'vignette',
  label: '暗角',
  min: -1,
  max: 1,
  step: 0.01,
  format: (v) => {
    const value = Math.round(v * 100);
    return value === 0 ? '0' : `${value > 0 ? '+' : ''}${value}`;
  },
};

interface FilterSectionProps {
  edit: EditState;
  library: Record<string, { name: string }>;
  onChange: (next: EditState, key: string | null) => void;
  onImport: (file: File) => Promise<string | null>;
}

export function FilterSection({ edit, library, onChange, onImport }: FilterSectionProps): React.JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const active = edit.lut.id;

  return (
    <>
      <div className="panel__group">
        <h3 className="panel__label">滤镜</h3>
        <div className="bands bands--filters">
          <button
            type="button"
            className="band band--text"
            data-active={active === null}
            onClick={() => onChange({ ...edit, lut: { id: null, intensity: 1 } }, null)}
          >
            无
          </button>
          {Object.entries(library).map(([id, item]) => (
            <button
              key={id}
              type="button"
              className="band band--text"
              data-active={active === id}
              onClick={() =>
                onChange({ ...edit, lut: { id, intensity: active === id ? edit.lut.intensity : 1 } }, `lut.${id}`)
              }
            >
              {item.name}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost panel__action" onClick={() => fileRef.current?.click()}>
          导入 .cube
        </button>
        {error ? <p className="rail__error">{error}</p> : null}
        <input
          ref={fileRef}
          className="visually-hidden"
          type="file"
          accept=".cube,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setError(null);
            void onImport(file).then(setError);
          }}
        />
      </div>

      {active !== null ? (
        <Slider
          control={INTENSITY}
          value={edit.lut.intensity}
          onChange={(value) => onChange({ ...edit, lut: { ...edit.lut, intensity: value } }, 'lut.intensity')}
        />
      ) : null}

      <div className="panel__group">
        <h3 className="panel__label">效果</h3>
        <Slider
          control={CLARITY}
          value={edit.fx.clarity}
          onChange={(value) => onChange({ ...edit, fx: { ...edit.fx, clarity: value } }, 'fx.clarity')}
        />
        <Slider
          control={GLOW}
          value={edit.fx.glow}
          onChange={(value) => onChange({ ...edit, fx: { ...edit.fx, glow: value } }, 'fx.glow')}
        />
        <Slider
          control={SOFTNESS}
          value={edit.fx.softness}
          onChange={(value) => onChange({ ...edit, fx: { ...edit.fx, softness: value } }, 'fx.softness')}
        />
        <Slider
          control={GRAIN}
          value={edit.fx.grain}
          onChange={(value) => onChange({ ...edit, fx: { ...edit.fx, grain: value } }, 'fx.grain')}
        />
        <Slider
          control={VIGNETTE}
          value={edit.fx.vignette}
          onChange={(value) => onChange({ ...edit, fx: { ...edit.fx, vignette: value } }, 'fx.vignette')}
        />
      </div>
    </>
  );
}
