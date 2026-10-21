import { useState } from "react";
import type { Category, CategoryKind } from "../../shared/types";
import { Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Select } from "../components/ui";
import { api, useData } from "../lib/api";

/** Paleta categórica de referência (ordem fixa). */
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948", "#898781"];

export function Categorias() {
  const { data: categories, error, reload } = useData(() => api.categories(), []);
  const [editing, setEditing] = useState<Category | CategoryKind | null>(null);

  const groups: { kind: CategoryKind; title: string }[] = [
    { kind: "despesa", title: "Despesas" },
    { kind: "receita", title: "Receitas" },
  ];

  return (
    <>
      <PageHeader title="Categorias" />
      <ErrorBanner message={error} />
      <div className="grid gap-5 md:grid-cols-2">
        {groups.map((g) => (
          <Card
            key={g.kind}
            title={g.title}
            action={
              <Button onClick={() => setEditing(g.kind)} className="text-xs">
                + Nova
              </Button>
            }
          >
            <ul className="divide-y divide-[var(--border)]">
              {categories
                ?.filter((c) => c.kind === g.kind)
                .map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setEditing(c)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-surface-2"
                    >
                      <span className="size-3 rounded-full" style={{ background: c.color }} />
                      {c.name}
                    </button>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>

      {editing && (
        <CategoryForm
          category={typeof editing === "string" ? null : editing}
          defaultKind={typeof editing === "string" ? editing : editing.kind}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function CategoryForm({
  category,
  defaultKind,
  onClose,
  onSaved,
}: {
  category: Category | null;
  defaultKind: CategoryKind;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? defaultKind);
  const [color, setColor] = useState(category?.color ?? PALETTE[0]!);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (category) await api.updateCategory(category.id, { name, kind, color });
      else await api.createCategory({ name, kind, color });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove() {
    if (!category) return;
    if (!confirm(`Excluir "${category.name}"? As transações ficarão sem categoria e os orçamentos dela serão removidos.`)) return;
    try {
      await api.deleteCategory(category.id);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal title={category ? "Editar categoria" : "Nova categoria"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <ErrorBanner message={error} />
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
          </Select>
        </Field>
        <Field label="Cor">
          <div className="flex flex-wrap items-center gap-2">
            {PALETTE.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={`Cor ${c}`}
                onClick={() => setColor(c)}
                className={`size-7 cursor-pointer rounded-full ring-offset-2 ring-offset-[var(--surface)] ${color === c ? "ring-2 ring-[var(--ink)]" : ""}`}
                style={{ background: c }}
              />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-10 cursor-pointer" />
          </div>
        </Field>
        <div className="mt-2 flex justify-between gap-2">
          {category ? (
            <Button type="button" variant="danger" onClick={remove}>
              Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Salvar
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
