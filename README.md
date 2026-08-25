# TendersBot

Bot de WhatsApp para tomar pedidos, cobrar (QR/transferencia con confirmación manual) y enviar comandas a cocina para una marca de tenders operada como cocina oculta.

## Requisitos

- Node.js 20+
- PostgreSQL (local o en Railway)
- Una cuenta de Meta Business + una app de WhatsApp Business Platform (gratis para empezar en modo de pruebas)

## 1. Configurar WhatsApp Cloud API

1. Entra a https://developers.facebook.com/ y crea una app tipo "Business".
2. Agrega el producto "WhatsApp" a la app.
3. En "API Setup" copia el `Temporary access token` (o genera uno permanente con un System User) y el `Phone number ID`.
4. Esos valores van en `.env` como `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
5. Inventa un `WHATSAPP_VERIFY_TOKEN` (cualquier string secreto) y ponlo también en `.env`.

## 2. Instalar y configurar el proyecto

```bash
npm install
cp .env.example .env
```

Llena `.env` con tus credenciales, el número de cocina, los administradores autorizados y los datos de pago (QR y cuenta).

## 3. Base de datos

```bash
npm run db:migrate
npm run db:seed
```

Esto crea las tablas y siembra un menú de ejemplo (edítalo en `prisma/seed.ts` con tu menú real antes de sembrar).

## 4. Correr localmente

```bash
npm run dev
```

El servidor queda escuchando en `http://localhost:3000/webhook`. Para que Meta pueda llamarlo necesitas exponerlo a internet (por ejemplo con `ngrok http 3000` durante pruebas).

En el panel de Meta, en "Configuration" del producto WhatsApp, registra:
- Callback URL: `https://<tu-url-publica>/webhook`
- Verify token: el mismo que pusiste en `WHATSAPP_VERIFY_TOKEN`
- Suscríbete al campo `messages`

## 5. Flujo de uso

**Cliente:** escribe al número de WhatsApp Business → ve el menú → pide por número de ítem → escribe `LISTO` → da dirección y nombre → recibe QR/datos de transferencia → envía foto del comprobante.

**Administrador (número en `ADMIN_PHONE_NUMBERS`):** recibe la foto del comprobante con el resumen del pedido → responde `CONFIRMAR <ID>` → el cliente recibe confirmación y la comanda se envía automáticamente al número de cocina (`KITCHEN_PHONE_NUMBER`).

Comandos de admin adicionales: `LISTO <ID>` (en camino), `ENTREGADO <ID>` (entregado).

## 5.1 Probar la conversación sin credenciales de WhatsApp ni Postgres

Para ver el bot funcionando localmente sin tener aún el token de Meta ni una base de datos Postgres, hay un esquema y un script de simulación que usan SQLite y solo imprimen los mensajes en consola en vez de llamarlos por WhatsApp:

```bash
DATABASE_URL="file:./sim.db" npx prisma db push --schema=prisma/schema.sim.prisma --skip-generate --accept-data-loss
DATABASE_URL="file:./sim.db" npx tsx prisma/seed.ts
DATABASE_URL="file:./sim.db" ADMIN_PHONE_NUMBERS="573000000000" KITCHEN_PHONE_NUMBER="573000000001" npx tsx prisma/simulate.ts
```

Esto corre el flujo real (menú → pedido → pago → confirmación admin → comanda) contra la misma lógica de negocio, sin depender de Meta. Después de probar, regenera el cliente de Postgres para volver a desarrollo/producción normal:

```bash
npx prisma generate
```

(`prisma/schema.sim.prisma` y `prisma/simulate.ts` son solo para pruebas locales, no se usan en producción.)

## 6. Desplegar (Railway recomendado)

1. Crea un proyecto en Railway, agrega un servicio Postgres.
2. Conecta este repo/carpeta como servicio Node.
3. Copia las variables de `.env` a las variables de entorno del servicio (usa la `DATABASE_URL` que Railway te da).
4. Railway te da una URL pública — regístrala como Callback URL del webhook en Meta.
5. Corre `npm run db:migrate` y `npm run db:seed` contra la base de producción (Railway permite correr comandos one-off o conectarte con `railway run`).

## Fuera de alcance de este MVP

- Cobro automático vía pasarela de pago (hoy es manual: el admin confirma tras ver el comprobante).
- Panel web de administración (todo se maneja por WhatsApp; el menú se edita en `prisma/seed.ts`).
- Múltiples cocinas / enrutamiento por zona.
- Facturación electrónica DIAN.
