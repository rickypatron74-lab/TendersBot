const GRAPH_API_VERSION = "v21.0";

function apiUrl(path: string): string {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/${path}`;
}

async function callGraphApi(body: unknown): Promise<void> {
  const res = await fetch(apiUrl("messages"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${errText}`);
  }
}

export async function sendText(to: string, text: string): Promise<void> {
  await callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

export async function sendImageByUrl(to: string, imageUrl: string, caption?: string): Promise<void> {
  await callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link: imageUrl, caption },
  });
}

export async function forwardImageById(to: string, mediaId: string, caption?: string): Promise<void> {
  await callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { id: mediaId, caption },
  });
}

export async function getMediaUrl(mediaId: string): Promise<string> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`No se pudo resolver el media ${mediaId}: ${res.status}`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
