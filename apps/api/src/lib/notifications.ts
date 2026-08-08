import { eq, inArray } from "drizzle-orm";
import { notifications } from "@bd/db";
import type { Db } from "../db";
import type { Env } from "../env";
import { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, ADMIN_WHATSAPP } from "../config";

export async function createNotification(
  db: Db,
  env: Env,
  input: { type?: string; title: string; body?: string; link?: string },
) {
  await db.insert(notifications).values(input).catch(() => {});
  // Push out-of-band alert via WhatsApp when configured (fire-and-forget)
  if (WHATSAPP_TOKEN(env) && WHATSAPP_PHONE_ID(env) && ADMIN_WHATSAPP(env)) {
    void sendWhatsApp(env, ADMIN_WHATSAPP(env)!, `${input.title}${input.body ? `\n${input.body}` : ""}`).catch(() => {});
  }
}

export async function markNotificationRead(db: Db, id: string) {
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id)).catch(() => {});
}

export async function markAllNotificationsRead(db: Db) {
  await db.update(notifications).set({ isRead: true }).where(inArray(notifications.isRead, [false])).catch(() => {});
}

// WhatsApp Cloud API send (optional; used by admin alerts / order notifications)
export async function sendWhatsApp(env: Env, to: string, message: string): Promise<boolean> {
  const token = WHATSAPP_TOKEN(env);
  const phoneId = WHATSAPP_PHONE_ID(env);
  if (!token || !phoneId) return false;
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    }),
  });
  return res.ok;
}
