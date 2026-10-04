// Personalizar XP y atributos (varios a la vez) de misiones y hábitos.
// Vacío = automático: el XP del tipo y los atributos deducidos del nombre.
import { useState, type FormEvent, type ReactNode } from 'react';
import type { AttributeId, AttributeRewards } from './types';
import { ATTRIBUTES, formatAttrXp } from './attributes';
import { CUSTOM_LIMITS } from './game';

export interface CustomValue {
  xp?: number;
  rewards?: AttributeRewards;
}

export const sameRewards = (a: AttributeRewards, b: AttributeRewards) =>
  ATTRIBUTES.every((x) => (a[x.id] ?? 0) === (b[x.id] ?? 0));

export function RewardEditor({
  autoXp, autoRewards, value, onChange, maxXp, idPrefix,
}: {
  autoXp: number;
  autoRewards: AttributeRewards;
  value: CustomValue;
  onChange: (v: CustomValue) => void;
  maxXp: number;
  idPrefix: string;
}) {
  const rewards = value.rewards ?? autoRewards;
  const custom = value.xp !== undefined || value.rewards !== undefined;
  function setAttr(id: AttributeId, raw: string) {
    const n = raw === '' ? 0 : Number(raw);
    if (Number.isNaN(n)) return;
    onChange({ ...value, rewards: { ...rewards, [id]: n } });
  }
  return (
    <div className="reward-editor">
      <label className="re-field re-xp" htmlFor={`${idPrefix}-xp`}>
        <span>XP</span>
        <input
          id={`${idPrefix}-xp`} type="number" min={0} max={maxXp} inputMode="numeric"
          placeholder={String(autoXp)} value={value.xp ?? ''}
          onChange={(e) => onChange({ ...value, xp: e.target.value === '' ? undefined : Number(e.target.value) })}
        />
      </label>
      {ATTRIBUTES.map((a) => (
        <label key={a.id} className={value.rewards ? 're-field' : 're-field auto'} htmlFor={`${idPrefix}-${a.id}`} title={a.name}>
          <span aria-hidden="true">{a.icon}</span>
          <span className="sr-only">{a.name}</span>
          <input
            id={`${idPrefix}-${a.id}`} type="number" min={0} max={CUSTOM_LIMITS.attribute} step="0.5" inputMode="decimal"
            value={rewards[a.id] ? formatAttrXp(rewards[a.id]!).replace(',', '.') : ''} placeholder="0"
            onChange={(e) => setAttr(a.id, e.target.value)}
          />
        </label>
      ))}
      <button type="button" className="link re-reset" disabled={!custom} onClick={() => onChange({})}>
        {custom ? 'Volver a automático' : 'Automático'}
      </button>
      <p className="re-hint">XP hasta {maxXp}; cada atributo hasta {CUSTOM_LIMITS.attribute}. Puedes repartir entre varios. Los topes diarios siguen contando.</p>
    </div>
  );
}

/** Botón ⚙ que despliega el editor dentro de un formulario de alta. */
export function CustomizeToggle({ open, onToggle, custom }: { open: boolean; onToggle: () => void; custom: boolean }) {
  return (
    <button type="button" className={custom ? 'ghost small customize on' : 'ghost small customize'} aria-expanded={open} onClick={onToggle} title="Ajustar XP y atributos">
      ⚙ {custom ? 'A medida' : 'XP y atributos'}
    </button>
  );
}

/** Editor en línea (nombre + XP + atributos) para una misión o hábito ya creado. */
export function InlineEdit({
  name, label, autoXp, autoRewards, initial, maxXp, idPrefix, onSave, onCancel, extra,
}: {
  name: string;
  label: string;
  autoXp: number;
  autoRewards: (name: string) => AttributeRewards;
  initial: CustomValue;
  maxXp: number;
  idPrefix: string;
  onSave: (name: string, v: CustomValue) => void;
  onCancel: () => void;
  extra?: ReactNode;
}) {
  const [title, setTitle] = useState(name);
  const [value, setValue] = useState<CustomValue>(initial);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const auto = autoRewards(title);
    const rewards = value.rewards && !sameRewards(value.rewards, auto) ? value.rewards : undefined;
    onSave(title, { xp: value.xp, rewards });
  }
  return (
    <form className="inline-edit" onSubmit={submit}>
      <input id={`${idPrefix}-name`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} aria-label={label} />
      {extra}
      <RewardEditor autoXp={autoXp} autoRewards={autoRewards(title)} value={value} onChange={setValue} maxXp={maxXp} idPrefix={idPrefix} />
      <div className="inline-edit-actions">
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="primary">Guardar</button>
      </div>
    </form>
  );
}
