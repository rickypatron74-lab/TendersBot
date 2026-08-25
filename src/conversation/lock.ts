// Serializa el procesamiento de mensajes del mismo número de teléfono para evitar
// que dos webhooks casi simultáneos lean/escriban la misma ConversationSession
// (lost update) o creen dos pedidos "carrito" duplicados para el mismo cliente.
const chains = new Map<string, Promise<unknown>>();

export function withPhoneLock<T>(phone: string, fn: () => Promise<T>): Promise<T> {
  const prior = chains.get(phone) ?? Promise.resolve();
  const result = prior.then(fn, fn);
  chains.set(
    phone,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
}
