import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config — `npm run db:generate` at image-build time turns lib/db/schema.ts into the SQL
 * migrations under ./drizzle, which lib/db/index.ts then applies at boot.
 *
 * The blueprint's version pointed `url` at ./data/app.db while the portal opens next-portal.db, and
 * ran `drizzle-kit push` during the BUILD — against a file inside the image that the ../_shared-db
 * bind mount then hides completely. So the schema it so carefully created was shadowed and never
 * used, and the tables the app really ran on came from a hand-written CREATE TABLE block instead.
 *
 * Two hand-maintained descriptions of one schema is a drift generator, and it duly drifted:
 * schema.ts declared contact_name/address, the DDL never created them, drizzle names every column of
 * a table in its INSERT — so EVERY customer insert threw, the portal booted looking healthy with no
 * customers in it, and nobody could sign in. Generating the SQL from schema.ts removes the second
 * description; schema.ts is now the only place the shape is written down, exactly as the Grails twin
 * derives its DDL from the domain classes and cannot drift either.
 */
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  // The file the portal actually opens (lib/db/index.ts). Only `drizzle-kit push`/`studio` connect;
  // `generate` just emits SQL — but pointing it anywhere else is how the confusion above started.
  dbCredentials: { url: "./data/next-portal.db" },
});
