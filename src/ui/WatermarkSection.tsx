import { useRef, useState } from 'react';
import type { EditState } from '../core/edit';
import { ANCHORS, type Anchor, type WatermarkParams } from '../core/watermark';
import { Slider, type SliderSpec } from './Slider';

const SIZE: SliderSpec = {
  key: 'mark-size',
  label: '大小',
  min: 0.01,
  max: 0.2,
  step: 0.002,
  format: (v) => `${Math.round(v * 1000) / 10}`,
};

const OPACITY: SliderSpec = {
  key: 'mark-opacity',
  label: '不透明度',
  min: 0,
  max: 1,
  step: 0.01,
  format: (v) => `${Math.round(v * 100)}`,
};

const ROTATION: SliderSpec = {
  key: 'mark-rotation',
  label: '角度',
  min: -90,
  max: 90,
  step: 1,
  format: (v) => `${Math.round(v)}°`,
};

const OFFSET_X: SliderSpec = {
  key: 'mark-offset-x',
  label: '横向',
  min: -0.3,
  max: 0.3,
  step: 0.005,
  format: (v) => `${Math.round(v * 1000) / 10}`,
};

const OFFSET_Y: SliderSpec = {
  key: 'mark-offset-y',
  label: '纵向',
  min: -0.3,
  max: 0.3,
  step: 0.005,
  format: (v) => `${Math.round(v * 1000) / 10}`,
};

const COLOURS = ['#ffffff', '#000000', '#f3f0e9', '#e5a93b'];

interface WatermarkSectionProps {
  edit: EditState;
  onChange: (next: EditState, key: string | null) => void;
  onImage: (file: File) => Promise<string | null>;
}

export function WatermarkSection({ edit, onChange, onImage }: WatermarkSectionProps): React.JSX.Element {
  const mark = edit.watermark;
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (next: Partial<WatermarkParams>, key: string | null): void =>
    onChange({ ...edit, watermark: { ...mark, ...next } }, key);

  return (
    <>
      <div className="panel__group">
        <h3 className="panel__label">水印</h3>
        <div className="bands bands--filters">
          {(['none', 'text', 'image'] as const).map((kind, index) => (
            <button
              key={kind}
              type="button"
              className="band band--text"
              data-active={mark.kind === kind}
              onClick={() => set({ kind }, `mark.${kind}`)}
            >
              {['无', '文字', '图片'][index]}
            </button>
          ))}
        </div>

        {mark.kind === 'text' ? (
          <>
            <input
              className="field field--full"
              value={mark.text}
              maxLength={40}
              placeholder="署名或标题"
              onChange={(e) => set({ text: e.target.value }, 'mark.text')}
            />
            <div className="swatches">
              {COLOURS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  className="swatch"
                  aria-label={`水印颜色 ${colour}`}
                  data-active={mark.colour === colour}
                  style={{ background: colour }}
                  onClick={() => set({ colour }, 'mark.colour')}
                />
              ))}
            </div>
          </>
        ) : null}

        {mark.kind === 'image' ? (
          <>
            <button type="button" className="btn btn--ghost panel__action" onClick={() => fileRef.current?.click()}>
              选择 PNG
            </button>
            {error ? <p className="rail__error">{error}</p> : null}
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              accept="image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setError(null);
                void onImage(file).then(setError);
              }}
            />
          </>
        ) : null}
      </div>

      {mark.kind !== 'none' ? (
        <>
          <div className="panel__group">
            <h3 className="panel__label">位置</h3>
            <div className="anchors">
              {ANCHORS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="anchor"
                  aria-label={item.label}
                  data-active={mark.anchor === item.key}
                  onClick={() => set({ anchor: item.key as Anchor }, 'mark.anchor')}
                />
              ))}
            </div>
            <div className="bands">
              {(['photo', 'frame'] as const).map((target, index) => (
                <button
                  key={target}
                  type="button"
                  className="band band--text"
                  data-active={mark.target === target}
                  onClick={() => set({ target }, 'mark.target')}
                >
                  {['落在照片', '落在卡纸'][index]}
                </button>
              ))}
              <button
                type="button"
                className="band band--text"
                data-active={mark.tile}
                onClick={() => set({ tile: !mark.tile }, 'mark.tile')}
              >
                平铺
              </button>
            </div>
          </div>

          <Slider control={SIZE} value={mark.size} onChange={(v) => set({ size: v }, 'mark.size')} />
          <Slider control={OPACITY} value={mark.opacity} onChange={(v) => set({ opacity: v }, 'mark.opacity')} />
          <Slider control={ROTATION} value={mark.rotation} onChange={(v) => set({ rotation: v }, 'mark.rotation')} />
          <Slider control={OFFSET_X} value={mark.offsetX} onChange={(v) => set({ offsetX: v }, 'mark.offsetX')} />
          <Slider control={OFFSET_Y} value={mark.offsetY} onChange={(v) => set({ offsetY: v }, 'mark.offsetY')} />
        </>
      ) : null}
    </>
  );
}
