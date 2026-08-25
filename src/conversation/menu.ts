import { prisma } from "../db/client";

export async function getActiveMenu() {
  return prisma.menuItem.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
}

export async function formatMenuMessage(): Promise<{ text: string; indexToId: Record<number, string> }> {
  const items = await getActiveMenu();
  const indexToId: Record<number, string> = {};
  let lastCategory = "";
  const lines: string[] = ["*Nuestro menú* 🍗", "Responde con el número del ítem que quieres pedir.", ""];

  items.forEach((item, i) => {
    const idx = i + 1;
    indexToId[idx] = item.id;
    if (item.category !== lastCategory) {
      lines.push(`_${item.category}_`);
      lastCategory = item.category;
    }
    lines.push(`${idx}. ${item.name} - $${(item.priceCents / 100).toFixed(0)}`);
  });

  lines.push("", "Cuando termines de armar tu pedido escribe *LISTO*.");
  return { text: lines.join("\n"), indexToId };
}
