CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('corrente', 'poupanca', 'cartao', 'investimento', 'dinheiro')),
  initial_balance_cents INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('receita', 'despesa')),
  color TEXT NOT NULL,
  UNIQUE (name, kind)
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('receita', 'despesa', 'transferencia')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  to_account_id INTEGER REFERENCES accounts (id) ON DELETE RESTRICT,
  CHECK ((kind = 'transferencia') = (to_account_id IS NOT NULL)),
  CHECK (to_account_id IS NULL OR to_account_id <> account_id)
);

CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_account ON transactions (account_id);
CREATE INDEX idx_transactions_to_account ON transactions (to_account_id);
CREATE INDEX idx_transactions_category ON transactions (category_id);

CREATE TABLE budgets (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  limit_cents INTEGER NOT NULL CHECK (limit_cents > 0),
  UNIQUE (category_id, month)
);

INSERT INTO categories (name, kind, color) VALUES
  ('Salário', 'receita', '#1baf7a'),
  ('Freelance', 'receita', '#2a78d6'),
  ('Rendimentos', 'receita', '#4a3aa7'),
  ('Outras receitas', 'receita', '#898781'),
  ('Moradia', 'despesa', '#2a78d6'),
  ('Alimentação', 'despesa', '#eb6834'),
  ('Transporte', 'despesa', '#1baf7a'),
  ('Saúde', 'despesa', '#eda100'),
  ('Lazer', 'despesa', '#e87ba4'),
  ('Educação', 'despesa', '#008300'),
  ('Compras', 'despesa', '#4a3aa7'),
  ('Contas e serviços', 'despesa', '#e34948'),
  ('Outras despesas', 'despesa', '#898781');
