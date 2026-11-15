import { useRef, useState } from 'react';
import { Check, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { ChecklistItem, OcrListGroup } from '../types';

interface ChecklistTabProps {
  listas: OcrListGroup[];
  onChangeListas: (nextListas: OcrListGroup[]) => void;
}

function createItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `item_${crypto.randomUUID()}`;
  }
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function ChecklistTab({ listas, onChangeListas }: ChecklistTabProps) {
  const [newItemDrafts, setNewItemDrafts] = useState<Record<string, string>>({});
  const [copiedListId, setCopiedListId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ listId: string; fromIndex: number } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const touchDragRef = useRef<{
    listId: string;
    fromIndex: number;
    startY: number;
    currentDelta: number;
  } | null>(null);

  const toggleItem = (listId: string, itemId: string) => {
    const next = listas.map((list) => {
      if (list.id !== listId) return list;
      return {
        ...list,
        items: list.items.map((it) =>
          it.id === itemId ? { ...it, completado: !it.completado } : it,
        ),
      };
    });
    onChangeListas(next);
  };

  const updateItemText = (listId: string, itemId: string, texto: string) => {
    const next = listas.map((list) => {
      if (list.id !== listId) return list;
      return {
        ...list,
        items: list.items.map((it) => (it.id === itemId ? { ...it, texto } : it)),
      };
    });
    onChangeListas(next);
  };

  const deleteItem = (listId: string, itemId: string) => {
    const next = listas.map((list) => {
      if (list.id !== listId) return list;
      return {
        ...list,
        items: list.items.filter((it) => it.id !== itemId),
      };
    });
    onChangeListas(next);
  };

  const addItem = (listId: string) => {
    const draft = (newItemDrafts[listId] || '').trim();
    if (!draft) return;

    const newItem: ChecklistItem = {
      id: createItemId(),
      texto: draft,
      completado: false,
    };

    const next = listas.map((list) =>
      list.id === listId ? { ...list, items: [...list.items, newItem] } : list,
    );
    onChangeListas(next);
    setNewItemDrafts((prev) => ({ ...prev, [listId]: '' }));
  };

  const reorderItem = (listId: string, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0) return;
    const next = listas.map((list) => {
      if (list.id !== listId) return list;
      if (toIndex >= list.items.length) return list;
      const copy = [...list.items];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return { ...list, items: copy };
    });
    onChangeListas(next);
  };

  const copyList = async (list: OcrListGroup) => {
    const formatted = list.items
      .map((it) => `${it.completado ? '[x]' : '[ ]'} ${it.texto}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedListId(list.id);
      setTimeout(() => setCopiedListId(null), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <div className="space-y-5">
      {listas.map((list, groupIdx) => {
        const total = list.items.length;
        const completed = list.items.filter((it) => it.completado).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        return (
          <section
            key={list.id}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden"
          >
            {/* List card header */}
            <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-2.5 min-w-0">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {listas.length > 1 ? `Lista ${groupIdx + 1}` : 'Lista de tareas'}
                  </h3>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                    Página {list.pagina}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => copyList(list)}
                  className="min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  {copiedListId === list.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                      <span>Copiada</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar lista</span>
                    </>
                  )}
                </button>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  <span>
                    {completed} de {total} {total === 1 ? 'completada' : 'completadas'}
                  </span>
                  <span className="font-mono">{pct}%</span>
                </div>
                <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-600 dark:bg-orange-500 transition-all duration-200 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Interactive items */}
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {list.items.map((item, idx) => {
                const isDragTarget =
                  dragState?.listId === list.id && dragOverIndex === idx && dragState.fromIndex !== idx;

                return (
                  <li
                    key={item.id}
                    draggable
                    onDragStart={(e) => {
                      setDragState({ listId: list.id, fromIndex: idx });
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(idx));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragState?.listId === list.id) {
                        setDragOverIndex(idx);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragState && dragState.listId === list.id) {
                        reorderItem(list.id, dragState.fromIndex, idx);
                      }
                      setDragState(null);
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragState(null);
                      setDragOverIndex(null);
                    }}
                    className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 transition-colors ${
                      isDragTarget ? 'bg-orange-50 dark:bg-orange-950/30' : ''
                    }`}
                  >
                    {/* Touch + pointer drag handle */}
                    <button
                      type="button"
                      aria-label="Arrastrar para reordenar"
                      onPointerDown={(e) => {
                        if (e.pointerType === 'mouse') return; // Mouse uses native HTML5 drag
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        touchDragRef.current = {
                          listId: list.id,
                          fromIndex: idx,
                          startY: e.clientY,
                          currentDelta: 0,
                        };
                        setDragState({ listId: list.id, fromIndex: idx });
                        setDragOverIndex(idx);
                      }}
                      onPointerMove={(e) => {
                        const t = touchDragRef.current;
                        if (!t || t.listId !== list.id || t.fromIndex !== idx) return;
                        const deltaRows = Math.round((e.clientY - t.startY) / 56);
                        const targetIdx = Math.min(list.items.length - 1, Math.max(0, t.fromIndex + deltaRows));
                        t.currentDelta = targetIdx - t.fromIndex;
                        setDragOverIndex(targetIdx);
                      }}
                      onPointerUp={() => {
                        const t = touchDragRef.current;
                        if (t && t.listId === list.id && t.fromIndex === idx) {
                          const targetIdx = Math.min(
                            list.items.length - 1,
                            Math.max(0, t.fromIndex + t.currentDelta),
                          );
                          reorderItem(list.id, t.fromIndex, targetIdx);
                        }
                        touchDragRef.current = null;
                        setDragState(null);
                        setDragOverIndex(null);
                      }}
                      onPointerCancel={() => {
                        touchDragRef.current = null;
                        setDragState(null);
                        setDragOverIndex(null);
                      }}
                      className="min-w-[36px] min-h-[44px] flex items-center justify-center text-zinc-400 dark:text-zinc-500 cursor-grab active:cursor-grabbing shrink-0 touch-none"
                      title="Arrastra para reordenar"
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>

                    {/* Large thumb-friendly checkbox */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.completado}
                      aria-label={item.completado ? `Desmarcar ${item.texto}` : `Marcar ${item.texto}`}
                      onClick={() => toggleItem(list.id, item.id)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                    >
                      <span
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                          item.completado
                            ? 'bg-orange-600 border-orange-600 text-white'
                            : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900'
                        }`}
                      >
                        {item.completado && <Check className="w-4 h-4 stroke-[2.5]" />}
                      </span>
                    </button>

                    {/* Inline editable text */}
                    <input
                      type="text"
                      value={item.texto}
                      onChange={(e) => updateItemText(list.id, item.id, e.target.value)}
                      aria-label="Editar tarea"
                      className={`flex-1 min-w-0 min-h-[44px] px-2 bg-transparent text-sm sm:text-[15px] focus:outline-none focus:bg-zinc-50 dark:focus:bg-zinc-800/60 rounded-lg ${
                        item.completado
                          ? 'line-through text-zinc-400 dark:text-zinc-500'
                          : 'text-zinc-900 dark:text-zinc-100'
                      }`}
                    />

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => deleteItem(list.id, item.id)}
                      aria-label={`Eliminar ${item.texto}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl shrink-0 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}

              {list.items.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  Esta lista no tiene elementos. Agrega uno nuevo abajo.
                </li>
              )}
            </ul>

            {/* Add new item row */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addItem(list.id);
              }}
              className="p-3 bg-zinc-50/70 dark:bg-zinc-950/40 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center gap-2"
            >
              <input
                type="text"
                value={newItemDrafts[list.id] || ''}
                onChange={(e) =>
                  setNewItemDrafts((prev) => ({ ...prev, [list.id]: e.target.value }))
                }
                placeholder="Agregar nuevo elemento..."
                className="flex-1 min-w-0 min-h-[44px] px-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                disabled={!(newItemDrafts[list.id] || '').trim()}
                className="min-h-[44px] px-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar</span>
              </button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
