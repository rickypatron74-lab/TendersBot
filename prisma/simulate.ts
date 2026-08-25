// Script temporal de simulación local. No forma parte del bot en producción.
import "dotenv/config";
import { handleCustomerMessage } from "../src/conversation/stateMachine";
import { handleAdminMessage } from "../src/admin/commands";
import type { InboundMessage } from "../src/whatsapp/types";

const CLIENTE = "573001112233";
const ADMIN = "573009998877";

function say(who: string, text: string) {
  console.log(`\n>>> [${who} escribe]: ${text}`);
}

async function customerText(text: string) {
  say("Cliente", text);
  const msg: InboundMessage = { from: CLIENTE, type: "text", text };
  await handleCustomerMessage(msg);
}

async function customerImage() {
  say("Cliente", "(envía foto del comprobante de pago)");
  const msg: InboundMessage = { from: CLIENTE, type: "image", mediaId: "media_fake_123" };
  await handleCustomerMessage(msg);
}

async function adminText(text: string) {
  say("Admin", text);
  const msg: InboundMessage = { from: ADMIN, type: "text", text };
  await handleAdminMessage(msg);
}

async function main() {
  console.log("========== PARTE 1: EL CLIENTE PIDE Y PAGA ==========");

  await customerText("Hola");
  await customerText("6"); // Tenders x5 Clásicos
  await customerText("1"); // Papas fritas
  await customerText("LISTO");
  await customerText("Calle 123 #45-67, Bogotá");
  await customerText("Ricky");

  await customerImage();

  console.log("\n========== PARTE 2: EL ADMIN CONFIRMA EL PAGO ==========");

  const { prisma } = await import("../src/db/client");
  const order = await prisma.order.findFirstOrThrow({ where: { status: "pago_por_verificar" } });
  const shortId = order.id.slice(-6).toUpperCase();

  await adminText(`CONFIRMAR ${shortId}`);

  console.log("\n========== PARTE 3: EL ADMIN ACTUALIZA EL ESTADO DEL PEDIDO ==========");

  await adminText(`LISTO ${shortId}`);
  await adminText(`ENTREGADO ${shortId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/db/client");
    await prisma.$disconnect();
  });
