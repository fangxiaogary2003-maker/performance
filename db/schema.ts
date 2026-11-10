import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', {
 id: text('id').primaryKey(), revision: integer('revision').notNull(),
 payload: text('payload').notNull(), updatedAt: text('updated_at').notNull(),
});
