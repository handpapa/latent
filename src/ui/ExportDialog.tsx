import { useState } from 'react';
import type { ExportFormat, ExportOptions } from '../export/exporter';
import { Slider, type SliderSpec } from './Slider';

const QUALITY: SliderSpec = {
  key: 'export-quality',
  label: '画质',
  min: 0.5,
  max: 1,
  step: 0.01,
  format: (v) => `${Math.round(v * 100)}`,
};

const FORMATS: ReadonlyArray<{ key: ExportFormat; label: string }> = [
  { key: 'png', label: 'PNG' },
  { key: 'jpeg', label: 'JPEG' },
  { key: 'webp', label: 'WebP' },
];

interface ExportDialogProps {
  size: { width: number; height: number };
  busy: boolean;
  error: string | null;
  onExport: (options: ExportOptions) => void;
  onClose: () => void;
}

export function ExportDialog({ size, busy, error, onExport, onClose }: ExportDialogProps): React.JSX.Element {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(0.92);
  const megapixels = ((size.width * size.height) / 1_000_000).toFixed(1);

  return (
    <div className="dialog-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="导出"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="dialog__head">
          <h2 className="dialog__title">导出</h2>
          <p className="dialog__meta">
            {size.width} × {size.height} · {megapixels} MP
          </p>
        </div>

        <div className="bands bands--filters">
          {FORMATS.map((item) => (
            <button
              key={item.key}
              type="button"
              className="band band--text"
              data-active={format === item.key}
              onClick={() => setFormat(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {format === 'png' ? (
          <p className="panel__hint">PNG 保留透明边角，适合再加工。</p>
        ) : (
          <>
            <Slider control={QUALITY} value={quality} onChange={setQuality} />
            <p className="panel__hint">不带透明通道，圆角外以白色填充。</p>
          </>
        )}

        {error ? <p className="rail__error">{error}</p> : null}

        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => onExport({ format, quality })}
          >
            {busy ? '正在导出…' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}
