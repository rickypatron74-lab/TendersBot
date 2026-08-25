import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const menu = [
  { name: "Tenders x5 Clásicos", description: "5 tenders de pollo apanados", priceCents: 1500000, category: "Tenders" },
  { name: "Tenders x8 Clásicos", description: "8 tenders de pollo apanados", priceCents: 2200000, category: "Tenders" },
  { name: "Combo Tenders x5 + Papas + Gaseosa", description: "", priceCents: 2000000, category: "Combos" },
  { name: "Papas fritas", description: "", priceCents: 700000, category: "Acompañantes" },
  { name: "Gaseosa 400ml", description: "", priceCents: 500000, category: "Bebidas" },
  { name: "Salsa BBQ", description: "", priceCents: 200000, category: "Salsas" },
  { name: "Salsa Ranch", description: "", priceCents: 200000, category: "Salsas" },
];

async function main() {
  for (const item of menu) {
    await prisma.menuItem.create({ data: item });
  }
  console.log(`Menú sembrado: ${menu.length} ítems.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
