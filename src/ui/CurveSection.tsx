import { useState } from 'react';
import { LINEAR_CURVE, type Curve, type Curves } from '../core/curve';
import { CurveEditor } from './CurveEditor';

const CHANNELS = [
  { key: 'rgb', label: 'RGB' },
  { key: 'r', label: 'R' },
  { key: 'g', label: 'G' },
  { key: 'b', label: 'B' },
] as const;

type ChannelKey = (typeof CHANNELS)[number]['key'];

interface CurveSectionProps {
  curves: Curves;
  onChange: (next: Curves, key: string) => void;
}

export function CurveSection({ curves, onChange }: CurveSectionProps): React.JSX.Element {
  const [channel, setChannel] = useState<ChannelKey>('rgb');
  const setCurve = (next: Curve): void => onChange({ ...curves, [channel]: next }, `curves.${channel}`);

  return (
    <div className="panel__group">
      <div className="tabs tabs--channels" role="tablist" aria-label="曲线通道">
        {CHANNELS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={channel === item.key}
            className="tab"
            data-active={channel === item.key}
            onClick={() => setChannel(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <CurveEditor curve={curves[channel]} onChange={setCurve} />

      <div className="panel__row">
        <p className="panel__hint">拖动加点，双击删除。</p>
        <button
          type="button"
          className="btn btn--ghost panel__reset"
          onClick={() => setCurve(LINEAR_CURVE)}
          disabled={curves[channel].every((p) => p.x === p.y)}
        >
          复位
        </button>
      </div>
    </div>
  );
}
