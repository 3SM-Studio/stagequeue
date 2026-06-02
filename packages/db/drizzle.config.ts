import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://poza_nuta:poza_nuta@localhost:5432/poza_nuta"
  },
  strict: true,
  verbose: true
})
