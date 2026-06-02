import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Configuration table - django-constance style key-value storage
 * Stores application settings that can be changed at runtime
 */
export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Type for config entries
export type Config = typeof config.$inferSelect;
export type NewConfig = typeof config.$inferInsert;

/**
 * Canvases table - stores explore-data work-in-progress dashboards
 * Each canvas holds its full state (widgets, layout, data sources, configs) as JSON
 */
export const canvases = sqliteTable("canvases", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  connectionId: text("connection_id"),
  state: text("state").notNull(), // JSON: { widgets, filters }
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type Canvas = typeof canvases.$inferSelect;
export type NewCanvas = typeof canvases.$inferInsert;

/**
 * Default configuration values
 * These are seeded on first run if not present
 */
export const DEFAULT_CONFIG = {
  // Web Apps Stack preference: 'grails' (default/recommended) or 'nextjs'
  'webapp_stack': {
    value: 'grails',
    description: 'Preferred web app stack for self-service portals (grails or nextjs)',
  },
  // NOTE: theme is intentionally NOT seeded. The app-wide default lives in code
  // (DEFAULT_THEME in app/layout.tsx). 'theme.color' is written only when a user
  // explicitly picks a theme, so it always reflects a real user choice.
  'llm.provider': {
    value: '{"activeProviderId":"openai","providers":{}}',
    description: 'LLM API provider configuration (JSON)',
  },
} as const;
