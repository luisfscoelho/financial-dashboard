import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import m001 from "./migrations/001-inicial.sql" with { type: "text" };
import m002 from "./migrations/002-parcelas.sql" with { type: "text" };
import m003 from "./migrations/003-fechamento-cartao.sql" with { type: "text" };
import m004 from "./migrations/004-metas-ideal-assinaturas.sql" with { type: "text" };

// Cada item é uma migração; a posição no array é a versão (PRAGMA user_version).
const MIGRATIONS: string[] = [m001, m002, m003, m004];

export const DEFAULT_DB_PATH = new URL("../../data/financas.db", import.meta.url).pathname;

export function openDb(path: string = process.env.DB_PATH ?? DEFAULT_DB_PATH): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { strict: true, create: true });
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: Database) {
  const { user_version } = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!;
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.run(MIGRATIONS[v]!);
      db.run(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}
