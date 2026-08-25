import { forwardImageById, sendText } from "../whatsapp/client";
import type { InboundMessage } from "../whatsapp/types";
import {
  confirmPayment,
  updateOrderStatus,
  getOrderWithDetails,
  formatComanda,
} from "../orders/orderService";
import { resetSession } from "../conversation/session";

const STATUS_LABEL: Record<string, string> = {
  carrito: "en carrito",
  pendiente_pago: "pendiente de pago",
  pago_por_verificar: "esperando verificación",
  pagado: "pagado",
  en_cocina: "en cocina",
  en_camino: "en camino",
  entregado: "entregado",
  cancelado: "cancelado",
};

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
    try {
      await forwardImageById(admin, mediaId, caption);
    } catch (err) {
      // Un admin con número inválido/no disponible no debe impedir que los demás se enteren.
      console.error(`No se pudo notificar al admin ${admin} del pedido ${shortId}:`, err);
    }
  }
}

/** Devuelve null si no hay coincidencias, o "ambiguous" si el id corto no alcanza para identificar un único pedido. */
async function findOrderByShortId(shortId: string) {
  const { prisma } = await import("../db/client");
  const matches = await prisma.order.findMany({
    where: { id: { endsWith: shortId.toLowerCase() } },
    orderBy: { createdAt: "desc" },
  });

  if (matches.length === 0) return { kind: "none" as const };
  if (matches.length > 1) return { kind: "ambiguous" as const, count: matches.length };
  return { kind: "found" as const, order: matches[0] };
}

function wrongStatusMessage(shortId: string, order: { status: string }, extra: string): string {
  return `Pedido ${shortId} ya está ${STATUS_LABEL[order.status] ?? order.status}, ${extra}.`;
}

/** Refresca el pedido, notifica al cliente (sin tronar si falla) y confirma al admin. */
async function notifyCustomerAndAck(orderId: string, customerMessage: string, adminFrom: string, adminAck: string): Promise<void> {
  const fullOrder = await getOrderWithDetails(orderId);
  if (fullOrder) {
    try {
      await sendText(fullOrder.customer.phone, customerMessage);
    } catch (err) {
      console.error(`No se pudo notificar al cliente del pedido ${orderId}:`, err);
    }
  }
  await sendText(adminFrom, adminAck);
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

  const match = await findOrderByShortId(shortId);
  if (match.kind === "none") {
    await sendText(message.from, `No encontré ningún pedido con el id ${shortId}.`);
    return;
  }
  if (match.kind === "ambiguous") {
    await sendText(message.from, `Hay ${match.count} pedidos que terminan en ${shortId}, no puedo saber cuál es. Pídeme un id más largo o revisa el pedido manualmente.`);
    return;
  }
  const order = match.order;

  switch (command.toUpperCase()) {
    case "CONFIRMAR": {
      if (order.status !== "pago_por_verificar") {
        await sendText(message.from, wrongStatusMessage(shortId, order, "no hay nada pendiente de confirmar"));
        break;
      }

      // El pago y el paso a cocina se confirman primero: si luego falla un aviso
      // por WhatsApp, el pedido no debe quedar atascado sin que ningún comando lo pueda mover.
      await confirmPayment(order.id);
      await updateOrderStatus(order.id, "en_cocina");

      const fullOrder = await getOrderWithDetails(order.id);
      const failedNotifications: string[] = [];
      if (fullOrder) {
        await resetSession(fullOrder.customer.phone);
        try {
          await sendText(fullOrder.customer.phone, "¡Tu pago fue confirmado! 🎉 Ya estamos preparando tu pedido.");
        } catch (err) {
          console.error(`No se pudo notificar al cliente del pedido ${shortId}:`, err);
          failedNotifications.push("cliente");
        }

        const kitchenPhone = process.env.KITCHEN_PHONE_NUMBER;
        if (kitchenPhone) {
          try {
            await sendText(kitchenPhone, formatComanda(fullOrder as any));
          } catch (err) {
            console.error(`No se pudo enviar la comanda del pedido ${shortId} a cocina:`, err);
            failedNotifications.push("cocina");
          }
        }
      }

      await sendText(
        message.from,
        failedNotifications.length
          ? `Pedido ${shortId} confirmado y marcado en cocina, pero no pude avisarle a: ${failedNotifications.join(", ")}. Revísalo manualmente.`
          : `Pedido ${shortId} confirmado y enviado a cocina.`
      );
      break;
    }
    case "LISTO": {
      if (order.status !== "en_cocina") {
        await sendText(message.from, wrongStatusMessage(shortId, order, "no está en cocina esperando salir"));
        break;
      }

      await updateOrderStatus(order.id, "en_camino");
      await notifyCustomerAndAck(order.id, "Tu pedido va en camino 🚗💨", message.from, `Pedido ${shortId} marcado como en camino.`);
      break;
    }
    case "ENTREGADO": {
      if (order.status !== "en_camino") {
        await sendText(message.from, wrongStatusMessage(shortId, order, "no está en camino todavía"));
        break;
      }

      await updateOrderStatus(order.id, "entregado");
      await notifyCustomerAndAck(order.id, "¡Gracias por tu pedido! Buen provecho 🍗", message.from, `Pedido ${shortId} marcado como entregado.`);
      break;
    }
    default:
      await sendText(message.from, `Comando desconocido: ${command}`);
  }
}
