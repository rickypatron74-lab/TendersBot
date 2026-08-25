import "dotenv/config";
import express from "express";
import { extractInboundMessages } from "./whatsapp/types";
import { handleCustomerMessage } from "./conversation/stateMachine";
import { isAdminPhone, handleAdminMessage } from "./admin/commands";

const app = express();
app.use(express.json());

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const messages = extractInboundMessages(req.body);
    for (const message of messages) {
      if (isAdminPhone(message.from)) {
        await handleAdminMessage(message);
      } else {
        await handleCustomerMessage(message);
      }
    }
  } catch (err) {
    console.error("Error procesando webhook:", err);
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ?? 3000;
app.listen(port, () => {
  console.log(`TendersBot escuchando en el puerto ${port}`);
});
