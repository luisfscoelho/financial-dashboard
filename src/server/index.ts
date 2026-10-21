import index from "../web/index.html";
import { apiRoutes } from "./api";
import { openDb } from "./db";

const db = openDb();
const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
  routes: {
    ...apiRoutes(db),
    "/api/*": Response.json({ error: "Rota não encontrada" }, { status: 404 }),
    "/*": index,
  },
});

console.log(`💰 Dashboard financeiro rodando em ${server.url}`);
