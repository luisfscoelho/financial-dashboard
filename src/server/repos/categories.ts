import type { Database } from "bun:sqlite";
import { CATEGORY_BUCKETS, type Category } from "../../shared/types";
import { asBody, badRequest, color, notFound, oneOf, str } from "../validation";

export function listCategories(db: Database) {
  return db.query<Category, []>("SELECT * FROM categories ORDER BY kind DESC, name COLLATE NOCASE").all();
}

export function getCategory(db: Database, id: number) {
  const row = db.query<Category, [number]>("SELECT * FROM categories WHERE id = ?").get(id);
  if (!row) throw notFound("Categoria");
  return row;
}

function parse(input: unknown) {
  const body = asBody(input);
  const kind = oneOf(body, "kind", "Tipo", ["receita", "despesa"] as const);
  return {
    name: str(body, "name", "Nome"),
    kind,
    color: color(body, "color"),
    // Despesas sem grupo informado entram como "livre" no Ideal
    bucket: kind === "despesa" ? (body.bucket ? oneOf(body, "bucket", "Grupo", CATEGORY_BUCKETS) : "livre") : null,
  };
}

function rethrowUnique(e: unknown): never {
  if (e instanceof Error && e.message.includes("UNIQUE")) throw badRequest("Já existe uma categoria com esse nome");
  throw e;
}

export function createCategory(db: Database, input: unknown) {
  const c = parse(input);
  try {
    return db
      .query<Category, typeof c>("INSERT INTO categories (name, kind, color, bucket) VALUES ($name, $kind, $color, $bucket) RETURNING *")
      .get(c)!;
  } catch (e) {
    rethrowUnique(e);
  }
}

export function updateCategory(db: Database, id: number, input: unknown) {
  const current = getCategory(db, id);
  const c = parse(input);
  if (c.kind !== current.kind) {
    const { n } = db
      .query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?")
      .get(id)!;
    if (n > 0) throw badRequest("Não é possível mudar o tipo de uma categoria que já tem transações");
  }
  try {
    return db
      .query<Category, typeof c & { id: number }>(
        "UPDATE categories SET name = $name, kind = $kind, color = $color, bucket = $bucket WHERE id = $id RETURNING *",
      )
      .get({ ...c, id })!;
  } catch (e) {
    rethrowUnique(e);
  }
}

/** Transações da categoria ficam sem categoria; orçamentos da categoria são removidos. */
export function deleteCategory(db: Database, id: number) {
  getCategory(db, id);
  db.query("DELETE FROM categories WHERE id = ?").run(id);
}
