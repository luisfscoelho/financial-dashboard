-- Ciclo de fatura do cartão (dia de fechamento e de vencimento).
ALTER TABLE accounts ADD COLUMN closing_day INTEGER CHECK (closing_day BETWEEN 1 AND 31);
ALTER TABLE accounts ADD COLUMN due_day INTEGER CHECK (due_day BETWEEN 1 AND 31);

-- Fatura (mês de vencimento, YYYY-MM) em que a compra/estorno no cartão entra.
-- NULL = conta sem ciclo de fatura: o lançamento conta pelo mês da data.
ALTER TABLE transactions ADD COLUMN invoice_month TEXT;

-- Em transferências para o cartão: qual fatura este pagamento quita.
ALTER TABLE transactions ADD COLUMN invoice_payment_for TEXT;

CREATE INDEX idx_transactions_invoice ON transactions (account_id, invoice_month);
CREATE INDEX idx_transactions_invoice_payment ON transactions (to_account_id, invoice_payment_for);
