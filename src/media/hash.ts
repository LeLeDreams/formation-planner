const CHUNK = 1024 * 1024

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Cheap content fingerprint for large media: size + SHA-256 of the head, middle and tail
 * megabyte. Hashing a whole multi-hundred-MB video would be slow and this is plenty to
 * tell two different files apart. Renaming a file does not change its hash.
 */
export async function hashFile(file: Blob): Promise<string> {
  const size = file.size
  const mid = Math.max(0, Math.floor(size / 2) - CHUNK / 2)
  const parts = [
    file.slice(0, CHUNK),
    file.slice(mid, mid + CHUNK),
    file.slice(Math.max(0, size - CHUNK), size),
  ]
  try {
    const buffers = await Promise.all(parts.map((p) => p.arrayBuffer()))
    const joined = new Uint8Array(buffers.reduce((n, b) => n + b.byteLength, 0))
    let off = 0
    for (const b of buffers) {
      joined.set(new Uint8Array(b), off)
      off += b.byteLength
    }
    return `${size}-${await sha256Hex(joined.buffer)}`
  } catch {
    // crypto.subtle is unavailable on insecure origins (e.g. a LAN IP over http).
    const lastModified = file instanceof File ? file.lastModified : 0
    return `${size}-${lastModified}`
  }
}
