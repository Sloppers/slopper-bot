const encoder = new TextEncoder()

export async function verifySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature.startsWith('sha256=')) return false

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expected = hexToBytes(signature.slice(7))

  if (signed.byteLength !== expected.byteLength) return false

  return crypto.subtle.timingSafeEqual(signed, expected)
}

function hexToBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes.buffer
}
