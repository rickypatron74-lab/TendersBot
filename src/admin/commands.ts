import { forwardImageById, sendText } from "../whatsapp/client";
import type { InboundMessage } from "../whatsapp/types";
import {
  confirmPayment,
  updateOrderStatus,
  getOrderWithDetails,
  formatComanda,
} from "../orders/orderService";
import { resetSession } from "../conversation/session";

function getAdminPhones(): string[] {
  return (process.env.ADMIN_PHONE_NUMBERS ?? "").split(",").map((p) => p.trim()).filter(Boolean);
}

export function isAdminPhone(phone: string): boolean {
  return getAdminPhones().includes(phone);
}

export async function notifyAdminsOfPaymentProof(orderId: string, mediaId: string): Promise<void> {
  const order = await getOrderWithDetails(orderId);
  if (!order) return;

  const shortId = order.id.slice(-6).toUpperCase();
  const caption = `Pedido #${shortId} de ${order.customer.name ?? order.customer.phone} - Total $${(order.totalCents / 100).toFixed(0)}\n\nResponde "CONFIRMAR ${shortId}" para aprobar el pago.`;

  for (const admin of getAdminPhones()) {
    await forwardImageById(admin, mediaId, caption);
  }
}

export async function handleAdminMessage(message: InboundMessage): Promise<void> {
  const text = (message.text ?? "").trim();
  const [command, shortId] = text.split(/\s+/);

  if (!command || !shortId) {
    await sendText(
      message.from,
      "Comandos disponibles:\nCONFIRMAR <id>\nLISTO <id>\nENTREGADO <id>"
    );
    return;
  }

  const order = await findOrderByShortId(shortId);
  if (!order) {
    await sendText(message.from, `No encontré ningún pedido con el id ${shortId}.`);
    return;
  }

  switch (command.toUpperCase()) {
    case "CONFIRMAR": {
      await confirmPayment(order.id);
      const fullOrder = await getOrderWithDetails(order.id);
      if (fullOrder) {
        await sendText(fullOrder.customer.phone, "¡Tu pago fue confirmado! 🎉 Ya estamos preparando tu pedido.");
        await resetSession(fullOrder.customer.phone);

        const kitchenPhone = process.env.KITCHEN_PHONE_NUMBER;
        if (kitchenPhone) {
          await sendText(kitchenPhone, formatComanda(fullOrder as any));
        }
        await updateOrderStatus(order.id, "en_cocina");
      }
      await sendText(message.from, `Pedido ${shortId} confirmado y enviado a cocina.`);
      break;
    }
    case "LISTO": {
      await updateOrderStatus(order.id, "en_camino");
      const fullOrder = await getOrderWithDetails(order.id);
      if (fullOrder) {
        await sendText(fullOrder.customer.phone, "Tu pedido va en camino 🚗💨");
      }
      await sendText(message.from, `Pedido ${shortId} marcado como en camino.`);
      break;
    }
    case "ENTREGADO": {
      await updateOrderStatus(order.id, "entregado");
      const fullOrder = await getOrderWithDetails(order.id);
      if (fullOrder) {
        await sendText(fullOrder.customer.phone, "¡Gracias por tu pedido! Buen provecho 🍗");
      }
      await sendText(message.from, `Pedido ${shortId} marcado como entregado.`);
      break;
    }
    default:
      await sendText(message.from, `Comando desconocido: ${command}`);
  }
}

async function findOrderByShortId(shortId: string) {
  const { prisma } = await import("../db/client");
  const orders = await prisma.order.findMany({
    where: { id: { endsWith: shortId.toLowerCase() } },
  });
  return orders[0] ?? null;
}
