-- Compras parceladas no cartão: cada parcela é uma transação ligada a um plano.
CREATE TABLE installment_plans (
  id INTEGER PRIMARY KEY,
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  count INTEGER NOT NULL CHECK (count BETWEEN 2 AND 48),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE transactions ADD COLUMN installment_plan_id INTEGER REFERENCES installment_plans (id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN installment_number INTEGER;

CREATE INDEX idx_transactions_installment_plan ON transactions (installment_plan_id);
