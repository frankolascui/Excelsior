// Misiones prehechas: catálogo por categorías + «Mías» (plantillas propias), para añadir con un toque.
import { useState, type FormEvent } from 'react';
import type { Game } from './screens';
import type { QuestTemplate, QuestType } from './types';
import { addFromTemplate, deleteTemplate, hasPending, saveTemplate, TEMPLATE_GROUPS } from './quest-templates';
import { CUSTOM_LIMITS, QUEST_LABEL, XP_RULES } from './game';
import { questRewards } from './attributes';
import { RewardEditor, type CustomValue } from './customize';
import { RewardTags } from './ui';
import { Icon } from './icons';
import { sfx } from './sfx';

const MINE = 'mias';
const TYPES: QuestType[] = ['daily', 'main', 'side'];

export function QuestTemplates({ game }: { game: Game }) {
  const { state, act } = game;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(TEMPLATE_GROUPS[0].id);
  const own = state.questTemplates ?? [];
  const items = tab === MINE ? own : TEMPLATE_GROUPS.find((g) => g.id === tab)?.items ?? [];

  function add(tpl: QuestTemplate) {
    act((s) => addFromTemplate(s, tpl, Date.now()));
    sfx.tick();
  }

  return (
    <div className="templates">
      <button type="button" className="secondary templates-open" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="list" /> Misiones prehechas <Icon name={open ? 'chevron-down' : 'chevron-right'} />
      </button>
      {open && (
        <div className="templates-body">
          <div className="templates-tabs" role="tablist" aria-label="Categorías">
            {[...TEMPLATE_GROUPS.map((g) => ({ id: g.id, name: g.name })), { id: MINE, name: `Mías${own.length ? ` · ${own.length}` : ''}` }].map((g) => (
              <button key={g.id} type="button" role="tab" aria-selected={tab === g.id} className={tab === g.id ? 'chip-btn on' : 'chip-btn'} onClick={() => setTab(g.id)}>{g.name}</button>
            ))}
          </div>
          {tab === MINE && own.length === 0 && <p className="muted small-text">Guarda aquí las misiones que repites a menudo, con su XP y atributos, y añádelas con un toque.</p>}
          <ul className="templates-list">
            {items.map((tpl) => {
              const have = hasPending(state, tpl.title);
              return (
                <li key={tpl.id} className="template-row">
                  <div className="template-main">
                    <span className="template-title">{tpl.title}</span>
                    <span className="template-meta">
                      <span className={`chip chip-${tpl.type}`}>{QUEST_LABEL[tpl.type]}</span>
                      <span className="mono muted">+{tpl.xp ?? XP_RULES.quest[tpl.type]} XP</span>
                      <RewardTags rewards={tpl.rewards} />
                    </span>
                  </div>
                  {tab === MINE && (
                    <button type="button" className="icon-btn" onClick={() => act((s) => deleteTemplate(s, tpl.id))} aria-label={`Borrar plantilla ${tpl.title}`} title="Borrar plantilla"><Icon name="trash" /></button>
                  )}
                  <button type="button" className={have ? 'ghost small' : 'primary small'} onClick={() => add(tpl)} aria-label={`Añadir ${tpl.title}`}
                    title={have ? 'Ya la tienes pendiente; se añadirá otra' : 'Añadir a tus misiones'}>
                    <Icon name={have ? 'check' : 'plus'} /> {have ? 'Otra' : 'Añadir'}
                  </button>
                </li>
              );
            })}
          </ul>
          {tab === MINE && <NewTemplate onSave={(tpl) => act((s) => saveTemplate(s, tpl))} />}
        </div>
      )}
    </div>
  );
}

function NewTemplate({ onSave }: { onSave: (tpl: Omit<QuestTemplate, 'id'>) => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<QuestType>('daily');
  const [custom, setCustom] = useState<CustomValue>({});
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title, type, rewards: custom.rewards ?? questRewards(type, title), xp: custom.xp });
    setTitle('');
    setCustom({});
    sfx.tick();
  }
  return (
    <form className="template-new" onSubmit={submit}>
      <p className="eyebrow">Nueva plantilla</p>
      <input id="new-template" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Nombre (ej. Clase de violín)" aria-label="Nombre de la plantilla" />
      <div className="quick-add-row">
        <div className="segmented" role="radiogroup" aria-label="Tipo de la plantilla">
          {TYPES.map((t) => (
            <button type="button" key={t} role="radio" aria-checked={type === t} className={type === t ? 'seg on' : 'seg'} onClick={() => setType(t)}>
              {QUEST_LABEL[t]} <span className="mono">{XP_RULES.quest[t]}</span>
            </button>
          ))}
        </div>
        <button type="submit" className="primary" disabled={!title.trim()}><Icon name="save" /> Guardar plantilla</button>
      </div>
      <RewardEditor autoXp={XP_RULES.quest[type]} autoRewards={questRewards(type, title)} value={custom} onChange={setCustom} maxXp={CUSTOM_LIMITS.questXp} idPrefix="new-template" />
    </form>
  );
}
