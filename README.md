# Finanças — dashboard de finanças pessoais

Site local para acompanhar receitas, despesas, orçamentos por categoria, contas e patrimônio.
Feito com **React** + **Bun** (servidor, bundler e `bun:sqlite`). Os dados ficam em `data/financas.db`.

## Como rodar

```sh
bun install
bun run dev            # http://localhost:3000 (com hot reload)
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `bun run seed` | Cria ~12 meses de dados de exemplo (só se o banco estiver vazio; `--force` apaga e recria) |
| `bun run start` | Roda em modo produção |
| `bun test` | Testes dos repositórios (SQLite em memória) |
| `bun run typecheck` | Checagem de tipos |

Variáveis de ambiente: `PORT` (padrão 3000) e `DB_PATH` (padrão `data/financas.db`).

**Backup:** basta copiar o arquivo `data/financas.db` (com o servidor parado).

## Estrutura

- `src/server/` — `Bun.serve` com a API REST (`/api/*`), banco e migrações (`db.ts`, `migrations/`), regras de negócio em `repos/`
- `src/web/` — app React (páginas em `pages/`, gráficos com Recharts, estilos com Tailwind)
- `src/shared/` — tipos e utilitários usados pelos dois lados

Valores são guardados em centavos (inteiros). Saldos e patrimônio são calculados a partir do saldo inicial
de cada conta mais os lançamentos até hoje; transferências movem dinheiro entre contas sem contar como receita/despesa.

**Compras parceladas:** numa despesa em conta do tipo cartão de crédito, escolha o número de parcelas (até 48x)
e informe o valor total. É criada uma transação por mês a partir da data da compra; os centavos que sobram da
divisão ficam na 1ª parcela. Cada parcela conta no orçamento do seu mês, e as parcelas a vencer aparecem
separadas do saldo na página Contas. Ao editar uma parcela, dá para excluir só ela ou a compra inteira.
