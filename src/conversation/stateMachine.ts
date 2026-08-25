import { sendText } from "../whatsapp/client";
import type { InboundMessage } from "../whatsapp/types";
import { formatMenuMessage } from "./menu";
import { getSession, saveSession, resetSession } from "./session";
import {
  getOrCreateCustomer,
  getOrCreateCartOrder,
  addItemToOrder,
  setDeliveryDetails,
  recordPaymentProof,
  getOrderWithDetails,
  formatOrderSummary,
} from "../orders/orderService";
import { notifyAdminsOfPaymentProof } from "../admin/commands";
import { prisma } from "../db/client";

export async function handleCustomerMessage(message: InboundMessage): Promise<void> {
  const phone = message.from;
  const session = await getSession(phone);
  const customer = await getOrCreateCustomer(phone);

  if (message.text?.trim().toUpperCase() === "CANCELAR") {
    await resetSession(phone);
    await sendText(phone, "Listo, cancelé tu pedido en curso. Escribe cualquier cosa para empezar de nuevo.");
    return;
  }

  switch (session.state) {
    case "menu":
      return handleMenuState(phone, message, session.context);
    case "collecting":
      return handleCollectingState(phone, message, session.context);
    case "address":
      return handleAddressState(phone, message, session.context);
    case "name":
      return handleNameState(phone, message, session.context, customer.id);
    case "confirm":
      return handleConfirmState(phone, message, session.context);
    case "awaiting_admin":
      await sendText(phone, "Tu pago está siendo verificado, te aviso apenas se confirme. Gracias por tu paciencia 🙏");
      return;
  }
}

async function handleMenuState(phone: string, message: InboundMessage, context: any) {
  if (!context.orderId) {
    const customer = await getOrCreateCustomer(phone);
    const order = await getOrCreateCartOrder(customer.id);
    context.orderId = order.id;
  }

  const { text, indexToId } = await formatMenuMessage();
  context.indexToId = indexToId;

  const selection = message.text?.trim();
  if (!selection || isNaN(Number(selection))) {
    await sendText(phone, `¡Hola! 👋 Bienvenido a nuestra marca de tenders.\n\n${text}`);
    await saveSession(phone, "menu", context);
    return;
  }

  const menuItemId = indexToId[Number(selection)];
  if (!menuItemId) {
    await sendText(phone, `No reconozco esa opción. \n\n${text}`);
    await saveSession(phone, "menu", context);
    return;
  }

  await addItemToOrder(context.orderId, menuItemId, 1);
  await sendText(phone, "Agregado ✅. ¿Quieres algo más? Responde con otro número, o escribe *LISTO* para continuar.");
  await saveSession(phone, "collecting", context);
}

async function handleCollectingState(phone: string, message: InboundMessage, context: any) {
  const text = message.text?.trim() ?? "";

  if (text.toUpperCase() === "LISTO") {
    await sendText(phone, "Perfecto. ¿Cuál es la dirección de entrega?");
    await saveSession(phone, "address", context);
    return;
  }

  const menuItemId = context.indexToId?.[Number(text)];
  if (!menuItemId) {
    await sendText(phone, "Responde con el número de otro ítem del menú, o escribe *LISTO* para continuar.");
    await saveSession(phone, "collecting", context);
    return;
  }

  await addItemToOrder(context.orderId, menuItemId, 1);
  await sendText(phone, "Agregado ✅. ¿Algo más? Número de ítem, o *LISTO*.");
  await saveSession(phone, "collecting", context);
}

async function handleAddressState(phone: string, message: InboundMessage, context: any) {
  const address = message.text?.trim();
  if (!address) {
    await sendText(phone, "Necesito la dirección de entrega en texto, por favor.");
    return;
  }

  await setDeliveryDetails(context.orderId, address);

  const customer = await getOrCreateCustomer(phone);
  if (!customer.name) {
    await sendText(phone, "¿A nombre de quién es el pedido?");
    await saveSession(phone, "name", context);
    return;
  }

  await goToConfirm(phone, context);
}

async function handleNameState(phone: string, message: InboundMessage, context: any, customerId: string) {
  const name = message.text?.trim();
  if (!name) {
    await sendText(phone, "¿A nombre de quién es el pedido?");
    return;
  }

  await prisma.customer.update({ where: { id: customerId }, data: { name } });
  await goToConfirm(phone, context);
}

async function goToConfirm(phone: string, context: any) {
  const order = await getOrderWithDetails(context.orderId);
  if (!order) return;

  const summary = formatOrderSummary(order as any);
  const qr = process.env.PAYMENT_QR_IMAGE_URL;
  const bankInfo = process.env.BANK_ACCOUNT_INFO;

  await sendText(
    phone,
    `${summary}\n\nPara confirmar tu pedido, paga por QR o transferencia:\n${qr ?? "(QR pendiente de configurar)"}\n${bankInfo ?? ""}\n\nCuando pagues, envíame la *foto/captura del comprobante* aquí mismo.`
  );
  await saveSession(phone, "confirm", context);
}

async function handleConfirmState(phone: string, message: InboundMessage, context: any) {
  if (message.type !== "image" || !message.mediaId) {
    await sendText(phone, "Cuando hagas el pago, envíame la foto o captura del comprobante para confirmar tu pedido.");
    return;
  }

  await recordPaymentProof(context.orderId, message.mediaId, "transferencia");
  await sendText(phone, "¡Recibido! Estoy verificando tu pago, te confirmo en un momento 🙌");
  await saveSession(phone, "awaiting_admin", context);

  await notifyAdminsOfPaymentProof(context.orderId, message.mediaId);
}
