import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import schema from "./schema.sql" with { type: "text" };

// Cada item é uma migração; a posição no array é a versão (PRAGMA user_version).
const MIGRATIONS: string[] = [schema];

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
