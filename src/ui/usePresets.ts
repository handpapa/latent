import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useCallback, useRef, useState } from 'react';
import { applyStrength, copyEdit, type EditState } from '../core/edit';
import {
  BUILTIN_PRESETS,
  loadCustom,
  parsePresets,
  presetEdit,
  saveCustom,
  serializePresets,
  type Preset,
} from '../core/presets';

gsap.registerPlugin(useGSAP);

export interface PresetsApi {
  presets: Preset[];
  activeId: string | null;
  strength: number;
  apply: (preset: Preset) => void;
  setStrength: (value: number) => void;
  detach: () => void;
  save: (name: string) => void;
  remove: (id: string) => void;
  exportFile: () => void;
  importFile: (file: File) => Promise<string | null>;
  hasCustom: boolean;
}

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Applying a card tweens a single scalar from 0 to 1 and derives the whole edit
 * from it, so curves, bands and grading arrive with the same motion as the
 * sliders — and strength 0 stays an exact identity while it runs.
 */
interface PresetDeps {
  edit: EditState;
  commit: (next: EditState, key?: string | null) => void;
  preview: (next: EditState) => void;
}

export function usePresets({ edit, commit, preview }: PresetDeps): PresetsApi {
  const [presets, setPresets] = useState<Preset[]>(() => [...BUILTIN_PRESETS, ...loadCustom()]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [strength, setStrengthValue] = useState(1);
  const progress = useRef({ t: 1 });
  const { contextSafe } = useGSAP();

  const apply = contextSafe((preset: Preset) => {
    const target = presetEdit(preset);
    setActiveId(preset.id);
    setStrengthValue(1);
    gsap.killTweensOf(progress.current);
    if (reducedMotion()) {
      commit(target);
      return;
    }
    progress.current.t = 0;
    gsap.to(progress.current, {
      t: 1,
      duration: 0.38,
      ease: 'expo.out',
      overwrite: true,
      onUpdate: () => preview(applyStrength(target, progress.current.t)),
      onComplete: () => commit(target),
    });
  });

  const setStrength = contextSafe((value: number) => {
    const preset = presets.find((p) => p.id === activeId);
    gsap.killTweensOf(progress.current);
    setStrengthValue(value);
    if (!preset) return;
    commit(value === 1 ? presetEdit(preset) : applyStrength(presetEdit(preset), value), 'strength');
  });

  const detach = contextSafe(() => {
    gsap.killTweensOf(progress.current);
    setActiveId(null);
  });

  const persist = (next: Preset[]): void => {
    setPresets(next);
    saveCustom(next);
  };

  const save = contextSafe((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const preset: Preset = {
      id: `custom-${Date.now().toString(36)}`,
      name: trimmed.slice(0, 24),
      edit: copyEdit(edit),
      custom: true,
    };
    persist([...presets, preset]);
    setActiveId(preset.id);
    setStrengthValue(1);
  });

  const remove = contextSafe((id: string) => {
    persist(presets.filter((p) => p.id !== id));
    if (activeId === id) setActiveId(null);
  });

  const exportFile = useCallback(() => {
    const custom = presets.filter((p) => p.custom);
    if (!custom.length) return;
    const blob = new Blob([serializePresets(custom)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'latent-presets.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [presets]);

  const importFile = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const imported = parsePresets(await file.text()).map((p, index) => ({
          ...p,
          id: `custom-${Date.now().toString(36)}-${index}`,
        }));
        if (!imported.length) return '这个文件里没有色卡。';
        persist([...presets, ...imported]);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    [presets],
  );

  return {
    presets,
    activeId,
    strength,
    apply,
    setStrength,
    detach,
    save,
    remove,
    exportFile,
    importFile,
    hasCustom: presets.some((p) => p.custom),
  };
}
