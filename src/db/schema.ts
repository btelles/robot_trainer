import { integer, pgTable, varchar, uuid, json } from "drizzle-orm/pg-core";
export const userConfigTable = pgTable("user_config", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id'),
  config: json().default({})
});