import { prisma } from "../db/client";

export type SessionState =
  | "menu"
  | "collecting"
  | "address"
  | "name"
  | "confirm"
  | "awaiting_admin";

export interface SessionContext {
  orderId?: string;
  indexToId?: Record<number, string>;
  pendingItemId?: string;
}

export async function getSession(phone: string) {
  const existing = await prisma.conversationSession.findUnique({ where: { phone } });
  if (existing) {
    return { state: existing.state as SessionState, context: existing.context as SessionContext };
  }
  return { state: "menu" as SessionState, context: {} as SessionContext };
}

export async function saveSession(phone: string, state: SessionState, context: SessionContext) {
  await prisma.conversationSession.upsert({
    where: { phone },
    update: { state, context: context as object },
    create: { phone, state, context: context as object },
  });
}

export async function resetSession(phone: string) {
  await saveSession(phone, "menu", {});
}
