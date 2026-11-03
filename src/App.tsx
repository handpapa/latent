import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { builtinLuts, parseCube, type Lut3D } from './core/cube';
import { deleteLut, loadLuts, saveLut } from './core/lutStore';
import { IDENTITY_EDIT, type EditState } from './core/edit';
import { encodeImage, exportName, type ExportOptions } from './export/exporter';
import { saveBlob } from './export/save';
import { invalidate } from './motion/ticker';
import type { WebGLRenderer } from './gl/renderer';
import { ExportDialog } from './ui/ExportDialog';
import { registerOpener } from './dev/hook';
import { EditPanel } from './ui/EditPanel';
import { PresetPanel } from './ui/PresetPanel';
import { Stage, type OpenedImage } from './ui/Stage';
import { TopBar } from './ui/TopBar';
import { rasterImage, rasterText, type Raster } from './ui/rasterText';
import { useHistory } from './ui/useHistory';
import { usePresets } from './ui/usePresets';

export default function App(): React.JSX.Element {
  const [source, setSource] = useState<OpenedImage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [software, setSoftware] = useState(false);
  const history = useHistory<EditState>(IDENTITY_EDIT);
  const edit = history.present;
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [luts, setLuts] = useState<Record<string, { name: string; doc: Lut3D; custom: boolean }>>(() =>
    Object.fromEntries(
      Object.entries(builtinLuts()).map(([id, entry]) => [id, { ...entry, custom: false }]),
    ),
  );
  const [markImage, setMarkImage] = useState<Raster | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const presets = usePresets({ edit, commit: history.commit, preview: history.preview });

  const open = useCallback(async (file: File) => {
    setNotice(null);
    try {
      // No colour-space conversion and no premultiplication: the shader applies
      // the sRGB transfer function itself, and a second one here would be the
      // double-encode bug the whole pipeline is built to avoid.
      const bitmap = await createImageBitmap(file, {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
        imageOrientation: 'from-image',
      });
      setSource({ bitmap, name: file.name });
    } catch (e) {
      setNotice(`无法读取这张图：${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => {
    registerOpener((bitmap, name) => setSource({ bitmap, name }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        inputRef.current?.click();
      }
    };
    const onPaste = (e: ClipboardEvent): void => {
      for (const item of e.clipboardData?.items ?? []) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void open(file);
          }
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [open]);

  const removeFilter = useCallback(
    (id: string) => {
      setLuts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      void deleteLut(id).catch(() => undefined);
      if (history.present.lut.id === id) {
        history.commit({ ...history.present, lut: { id: null, intensity: 1 } }, null);
      }
    },
    [history],
  );

  const onThumbnails = useCallback((urls: Record<string, string>) => setThumbs(urls), []);

  const attachRenderer = useCallback((renderer: WebGLRenderer | null) => {
    rendererRef.current = renderer;
  }, []);

  // Stable identity: it sits in the stage's effect dependencies.
  const onCamera = useCallback((state: { zoom: number; free: boolean }) => setZoom(state.zoom), []);

  const runExport = async (options: ExportOptions): Promise<void> => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    setExporting(true);
    setExportError(null);
    try {
      const image = renderer.exportImage();
      if (!image) throw new Error('没有可导出的画面。');
      const blob = await encodeImage(image, options);
      const saved = await saveBlob(blob, exportName(source?.name ?? null, options.format), options.format);
      if (saved !== null) setExportOpen(false);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };

  const lutDoc = edit.lut.id ? (luts[edit.lut.id]?.doc ?? null) : null;

  // Filter tables outlive the session; the document that points at them does not.
  useEffect(() => {
    let live = true;
    void loadLuts().then((stored) => {
      if (!live || stored.length === 0) return;
      setLuts((current) => {
        const next = { ...current };
        for (const lut of stored) {
          next[lut.id] = {
            name: lut.name,
            doc: { size: lut.size, title: lut.name, data: lut.data },
            custom: true,
          };
        }
        return next;
      });
    });
    return () => {
      live = false;
    };
  }, []);

  const textMark = useMemo(
    () =>
      edit.watermark.kind === 'text'
        ? rasterText(edit.watermark.text, edit.watermark.colour)
        : null,
    [edit.watermark.kind, edit.watermark.text, edit.watermark.colour],
  );
  const watermark = edit.watermark.kind === 'image' ? markImage : textMark;

  const loadMarkImage = useCallback(async (file: File): Promise<string | null> => {
    try {
      const bitmap = await createImageBitmap(file);
      setMarkImage(rasterImage(bitmap));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, []);

  const importFilter = useCallback(async (file: File): Promise<string | null> => {
    try {
      const doc = parseCube(await file.text());
      const id = `imported-${Date.now().toString(36)}`;
      const name = doc.title || file.name;
      setLuts((current) => ({ ...current, [id]: { name, doc, custom: true } }));
      history.commit({ ...history.present, lut: { id, intensity: 1 } }, null);
      void saveLut({ id, name, size: doc.size, data: doc.data }).catch(() => undefined);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [history]);

  // Touching a slider detaches the colour card: the numbers no longer describe
  // that preset, and leaving it lit would be a lie about what you are looking at.
  const handleEdit = (next: EditState, key: string | null): void => {
    presets.detach();
    history.commit(next, key);
  };

  const onUndo = useCallback((): void => {
    presets.detach();
    history.undo();
  }, [presets.detach, history.undo]);

  const onRedo = useCallback((): void => {
    presets.detach();
    history.redo();
  }, [presets.detach, history.redo]);

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
      } else if (key === 'y') {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [onUndo, onRedo]);

  return (
    <div className="app" data-panel={source ? 'true' : 'false'}>
      <TopBar
        name={source?.name ?? null}
        width={source?.bitmap.width ?? null}
        height={source?.bitmap.height ?? null}
        notice={notice ?? (software ? '软件渲染，预览会变慢' : null)}
        onOpen={() => inputRef.current?.click()}
        onExport={() => {
          setExportError(null);
          setExportOpen(true);
        }}
        zoom={zoom}
        onToggleZoom={() => {
          const renderer = rendererRef.current;
          if (!renderer) return;
          setZoom(renderer.isFree() ? renderer.zoomToFit() : renderer.zoomToActual());
          invalidate();
        }}
      />
      <Stage
        source={source}
        onFile={(f) => void open(f)}
        onPick={() => inputRef.current?.click()}
        onSoftware={setSoftware}
        edit={edit}
        presets={presets.presets}
        onThumbnails={onThumbnails}
        lutId={edit.lut.id}
        lut={lutDoc}
        watermark={watermark}
        onRenderer={attachRenderer}
        onCamera={onCamera}
      />
      {source ? <PresetPanel api={presets} thumbs={thumbs} /> : null}
      {source ? (
        <EditPanel
          edit={edit}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          filters={luts}
          onImportFilter={importFilter}
          onRemoveFilter={removeFilter}
          onWatermarkImage={loadMarkImage}
          onChange={handleEdit}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      ) : null}
      {exportOpen && source && rendererRef.current ? (
        <ExportDialog
          size={rendererRef.current.exportSize() ?? { width: 0, height: 0 }}
          busy={exporting}
          error={exportError}
          onExport={(options) => void runExport(options)}
          onClose={() => {
            if (!exporting) setExportOpen(false);
          }}
        />
      ) : null}
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void open(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
