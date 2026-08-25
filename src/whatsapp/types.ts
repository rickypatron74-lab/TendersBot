export interface InboundMessage {
  from: string;
  type: "text" | "image" | "interactive" | "button" | string;
  text?: string;
  mediaId?: string;
}

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
          image?: { id: string };
          interactive?: {
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
          };
        }>;
      };
    }>;
  }>;
}

export function extractInboundMessages(payload: WhatsAppWebhookPayload): InboundMessage[] {
  const messages: InboundMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (msg.type === "text") {
          messages.push({ from: msg.from, type: "text", text: msg.text?.body ?? "" });
        } else if (msg.type === "image") {
          messages.push({ from: msg.from, type: "image", mediaId: msg.image?.id });
        } else if (msg.type === "interactive") {
          const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
          messages.push({ from: msg.from, type: "interactive", text: reply?.id ?? reply?.title ?? "" });
        }
      }
    }
  }

  return messages;
}
