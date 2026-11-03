import { useRef, useState } from 'react';
import type { Preset } from '../core/presets';
import { Slider, STRENGTH } from './Slider';
import type { PresetsApi } from './usePresets';

interface PresetPanelProps {
  api: PresetsApi;
  /** Data URLs of the user's own photo under each preset, keyed by preset id. */
  thumbs: Record<string, string>;
}

export function PresetPanel({ api, thumbs }: PresetPanelProps): React.JSX.Element {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = (): void => {
    if (!name.trim()) return;
    api.save(name);
    setName('');
    setSaving(false);
  };

  return (
    <aside className="rail" aria-label="色卡">
      <div className="rail__head">
        <h2 className="rail__title">色卡</h2>
      </div>

      <div className="rail__grid">
        {api.presets.map((preset: Preset) => (
          <div className="tile" key={preset.id}>
            <button
              type="button"
              className="tile__button"
              data-active={preset.id === api.activeId}
              aria-pressed={preset.id === api.activeId}
              onClick={() => api.apply(preset)}
            >
              {thumbs[preset.id] ? (
                <img className="tile__image" src={thumbs[preset.id]} alt="" draggable={false} />
              ) : (
                <span className="tile__image tile__image--empty" />
              )}
              <span className="tile__name">{preset.name}</span>
            </button>
            {preset.custom ? (
              <button
                type="button"
                className="tile__remove"
                aria-label={`删除色卡 ${preset.name}`}
                onClick={() => api.remove(preset.id)}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {api.activeId ? (
        <div className="rail__strength">
          <Slider control={STRENGTH} value={api.strength} onChange={api.setStrength} />
        </div>
      ) : null}

      {saving ? (
        <div className="rail__save">
          <input
            className="field"
            autoFocus
            value={name}
            maxLength={24}
            placeholder="色卡名字"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setSaving(false);
                setName('');
              }
            }}
          />
          <button type="button" className="btn rail__save-button" onClick={commit}>
            保存
          </button>
        </div>
      ) : null}

      <div className="rail__foot">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setSaving(true);
            setError(null);
          }}
        >
          存为色卡
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
          导入
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={api.exportFile}
          disabled={!api.hasCustom}
        >
          导出
        </button>
      </div>

      {error ? <p className="rail__error">{error}</p> : null}

      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void api.importFile(file).then(setError);
        }}
      />
    </aside>
  );
}
