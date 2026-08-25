import { prisma } from "../db/client";

/**
 * WhatsApp Cloud API entrega webhooks al menos una vez (puede reenviar el mismo
 * mensaje). Usa el id del mensaje como llave única en la DB: si ya existe,
 * significa que este mensaje ya se procesó y hay que ignorarlo.
 */
export async function markProcessedOnce(waMessageId: string): Promise<boolean> {
  try {
    await prisma.processedMessage.create({ data: { waMessageId } });
    return true;
  } catch {
    return false;
  }
}
