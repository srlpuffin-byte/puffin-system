import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id"),
  usuario: text("usuario"),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  user_agent: text("user_agent"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
