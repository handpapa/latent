import { isFramed, NO_FRAME, type FrameParams } from '../core/frame';
import type { EditState } from '../core/edit';
import { Slider, type SliderSpec } from './Slider';

const INSETS = [
  { key: 'insets.t', label: '上', field: 't' },
  { key: 'insets.r', label: '右', field: 'r' },
  { key: 'insets.b', label: '下', field: 'b' },
  { key: 'insets.l', label: '左', field: 'l' },
] as const;

const insetSpec = (key: string, label: string): SliderSpec => ({
  key,
  label,
  min: 0,
  max: 0.25,
  step: 0.005,
  format: (v) => `${Math.round(v * 100)}`,
});

const RADIUS: SliderSpec = {
  key: 'radius',
  label: '圆角',
  min: 0,
  max: 0.06,
  step: 0.002,
  format: (v) => `${Math.round(v * 1000) / 10}`,
};

const PRESETS: ReadonlyArray<{ label: string; frame: FrameParams }> = [
  { label: '无', frame: NO_FRAME },
  {
    label: '白卡',
    frame: {
      kind: 'mat',
      insets: { t: 0.05, r: 0.05, b: 0.05, l: 0.05 },
      color: '#f3f0e9',
      radius: 0,
    },
  },
  {
    label: '黑卡',
    frame: {
      kind: 'mat',
      insets: { t: 0.06, r: 0.06, b: 0.06, l: 0.06 },
      color: '#0d0d0d',
      radius: 0,
    },
  },
  {
    label: '宝丽来',
    frame: {
      kind: 'mat',
      insets: { t: 0.045, r: 0.045, b: 0.2, l: 0.045 },
      color: '#f6f3ec',
      radius: 0,
    },
  },
];

const COLOURS = ['#f6f3ec', '#ffffff', '#0d0d0d', '#d8d0bf'];

interface FrameSectionProps {
  edit: EditState;
  onChange: (next: EditState, key: string | null) => void;
}

export function FrameSection({ edit, onChange }: FrameSectionProps): React.JSX.Element {
  const frame = edit.frame;
  const set = (next: Partial<FrameParams>, key: string | null): void =>
    onChange({ ...edit, frame: { ...frame, ...next } }, key);

  return (
    <>
      <div className="panel__group">
        <h3 className="panel__label">装裱</h3>
        <div className="bands bands--filters">
          {PRESETS.map((item) => (
            <button
              key={item.label}
              type="button"
              className="band band--text"
              data-active={JSON.stringify(frame) === JSON.stringify(item.frame)}
              onClick={() => onChange({ ...edit, frame: item.frame }, `frame.${item.label}`)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {isFramed(frame) ? (
          <>
            <div className="swatches">
              {COLOURS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  className="swatch"
                  aria-label={`卡纸颜色 ${colour}`}
                  data-active={frame.color === colour}
                  style={{ background: colour }}
                  onClick={() => set({ color: colour }, 'frame.color')}
                />
              ))}
            </div>

            {INSETS.map((item) => (
              <Slider
                key={item.key}
                control={insetSpec(item.key, item.label)}
                value={frame.insets[item.field]}
                onChange={(value) =>
                  set({ insets: { ...frame.insets, [item.field]: value } }, `frame.insets.${item.field}`)
                }
              />
            ))}

            <Slider
              control={RADIUS}
              value={frame.radius}
              onChange={(value) => set({ radius: value }, 'frame.radius')}
            />
          </>
        ) : null}
      </div>
    </>
  );
}
