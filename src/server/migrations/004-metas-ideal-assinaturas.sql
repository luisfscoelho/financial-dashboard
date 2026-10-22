-- Metas de reserva: o valor atual é o saldo da conta vinculada.
CREATE TABLE goals (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  target_cents INTEGER NOT NULL CHECK (target_cents > 0),
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  target_month TEXT -- opcional, YYYY-MM
);

CREATE INDEX idx_goals_account ON goals (account_id);

-- Grupo do "Ideal" (50/30/20) de cada categoria de despesa.
ALTER TABLE categories ADD COLUMN bucket TEXT CHECK (bucket IN ('fixo', 'livre'));
UPDATE categories
SET bucket = CASE WHEN name IN ('Moradia', 'Saúde', 'Educação', 'Contas e serviços', 'Transporte') THEN 'fixo' ELSE 'livre' END
WHERE kind = 'despesa';

-- Percentual ideal da renda para cada grupo (a soma é sempre 100).
CREATE TABLE ideal_split (
  bucket TEXT PRIMARY KEY CHECK (bucket IN ('fixo', 'livre', 'investimento')),
  pct INTEGER NOT NULL CHECK (pct BETWEEN 0 AND 100)
);
INSERT INTO ideal_split (bucket, pct) VALUES ('fixo', 50), ('livre', 30), ('investimento', 20);

-- Assinaturas mensais ou anuais (com o mês de renovação).
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  period TEXT NOT NULL CHECK (period IN ('mensal', 'anual')),
  renewal_month INTEGER CHECK (renewal_month BETWEEN 1 AND 12),
  account_id INTEGER REFERENCES accounts (id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  CHECK ((period = 'anual') = (renewal_month IS NOT NULL))
);
