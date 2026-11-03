import { useState } from 'react';
import { IDENTITY_EDIT, isIdentityEdit, type EditState } from '../core/edit';
import { AdjustSection } from './AdjustSection';
import { CurveSection } from './CurveSection';
import { FilterSection } from './FilterSection';
import { FrameSection } from './FrameSection';
import { GradeSection } from './GradeSection';
import { HslSection } from './HslSection';
import { WatermarkSection } from './WatermarkSection';

const TABS = [
  { key: 'adjust', label: '调色' },
  { key: 'curves', label: '曲线' },
  { key: 'hsl', label: 'HSL' },
  { key: 'grade', label: '分级' },
  { key: 'filter', label: '滤镜' },
  { key: 'frame', label: '相框' },
  { key: 'mark', label: '水印' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface EditPanelProps {
  edit: EditState;
  canUndo: boolean;
  canRedo: boolean;
  /** The key names the control, so one drag collapses into one undo step. */
  /** Filter tables live outside the document; only their id and strength are in it. */
  filters: Record<string, { name: string; custom?: boolean }>;
  onImportFilter: (file: File) => Promise<string | null>;
  onRemoveFilter: (id: string) => void;
  onWatermarkImage: (file: File) => Promise<string | null>;
  onChange: (next: EditState, key: string | null) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function EditPanel({
  edit,
  canUndo,
  canRedo,
  filters,
  onImportFilter,
  onRemoveFilter,
  onWatermarkImage,
  onChange,
  onUndo,
  onRedo,
}: EditPanelProps): React.JSX.Element {
  const [tab, setTab] = useState<TabKey>('adjust');

  return (
    <aside className="panel" aria-label="调整">
      <div className="panel__head">
        <h2 className="panel__title">调整</h2>
        <div className="panel__actions">
          <button type="button" className="btn btn--ghost panel__action" onClick={onUndo} disabled={!canUndo}>
            撤销
          </button>
          <button type="button" className="btn btn--ghost panel__action" onClick={onRedo} disabled={!canRedo}>
            重做
          </button>
          <button
            type="button"
            className="btn btn--ghost panel__action"
            onClick={() => onChange(IDENTITY_EDIT, null)}
            disabled={isIdentityEdit(edit)}
          >
            重置
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="调整分类">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className="tab"
            data-active={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'adjust' ? (
        <AdjustSection
          params={edit.adjust}
          onChange={(adjust, key) => onChange({ ...edit, adjust }, key)}
        />
      ) : null}
      {tab === 'curves' ? (
        <CurveSection
          curves={edit.curves}
          onChange={(curves, key) => onChange({ ...edit, curves }, key)}
        />
      ) : null}
      {tab === 'hsl' ? (
        <HslSection bands={edit.hsl} onChange={(hsl, key) => onChange({ ...edit, hsl }, key)} />
      ) : null}
      {tab === 'grade' ? (
        <GradeSection grade={edit.grade} onChange={(grade, key) => onChange({ ...edit, grade }, key)} />
      ) : null}
      {tab === 'frame' ? <FrameSection edit={edit} onChange={onChange} /> : null}
      {tab === 'mark' ? (
        <WatermarkSection edit={edit} onChange={onChange} onImage={onWatermarkImage} />
      ) : null}
      {tab === 'filter' ? (
        <FilterSection
          edit={edit}
          library={filters}
          onChange={onChange}
          onImport={onImportFilter}
          onRemove={onRemoveFilter}
        />
      ) : null}
    </aside>
  );
}
