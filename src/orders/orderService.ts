import { prisma } from "../db/client";
import type { Order, OrderItem, MenuItem } from "@prisma/client";

export async function getOrCreateCustomer(phone: string) {
  return prisma.customer.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });
}

export async function getOrCreateCartOrder(customerId: string) {
  const existing = await prisma.order.findFirst({
    where: { customerId, status: "carrito" },
  });
  if (existing) return existing;

  return prisma.order.create({
    data: { customerId, status: "carrito" },
  });
}

export async function addItemToOrder(orderId: string, menuItemId: string, quantity: number) {
  const menuItem = await prisma.menuItem.findUniqueOrThrow({ where: { id: menuItemId } });

  await prisma.orderItem.create({
    data: {
      orderId,
      menuItemId,
      quantity,
      unitPriceCents: menuItem.priceCents,
    },
  });

  await recalculateTotal(orderId);
}

export async function recalculateTotal(orderId: string) {
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  const totalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  await prisma.order.update({ where: { id: orderId }, data: { totalCents } });
  return totalCents;
}

export async function setDeliveryDetails(orderId: string, address: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "pendiente_pago" },
  });
  await prisma.customer.update({
    where: { id: (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).customerId },
    data: { address },
  });
}

export async function recordPaymentProof(orderId: string, mediaId: string, method: "qr" | "transferencia") {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "pago_por_verificar", paymentProofMediaId: mediaId, paymentMethod: method },
  });
}

export async function confirmPayment(orderId: string) {
  return prisma.order.update({ where: { id: orderId }, data: { status: "pagado" } });
}

export async function updateOrderStatus(orderId: string, status: "en_cocina" | "en_camino" | "entregado" | "cancelado") {
  return prisma.order.update({ where: { id: orderId }, data: { status } });
}

export async function getOrderWithDetails(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { menuItem: true } }, customer: true },
  });
}

type OrderWithItems = Order & { items: (OrderItem & { menuItem: MenuItem })[] };

export function formatOrderSummary(order: OrderWithItems): string {
  const lines = order.items.map(
    (item) => `- ${item.quantity}x ${item.menuItem.name} ($${(item.unitPriceCents * item.quantity / 100).toFixed(0)})`
  );
  const total = (order.totalCents / 100).toFixed(0);
  return `*Resumen de tu pedido*\n${lines.join("\n")}\n\n*Total: $${total}*`;
}

export function formatComanda(order: OrderWithItems & { customer: { phone: string; name: string | null; address: string | null } }): string {
  const lines = order.items.map((item) => `- ${item.quantity}x ${item.menuItem.name}${item.notes ? ` (${item.notes})` : ""}`);
  return [
    `*NUEVO PEDIDO #${order.id.slice(-6).toUpperCase()}*`,
    ...lines,
    ``,
    `Cliente: ${order.customer.name ?? "N/A"} (${order.customer.phone})`,
    `Dirección: ${order.customer.address ?? "N/A"}`,
    `Pago: ${order.paymentMethod ?? "N/A"} ✅`,
    `Total: $${(order.totalCents / 100).toFixed(0)}`,
  ].join("\n");
}
