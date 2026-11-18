import { computed, shallowReactive } from 'vue'

/**
 * What Linux is downloading, for the terminals' progress bar: the kernel wasm, the disk's boot bundle, and later any
 * disk chunk the guest reads. Bytes are counted as the response bodies stream in, so a response the browser already
 * has (a finished preload, the HTTP cache) counts too, only faster.
 */
export interface Download {
  loaded: number
  /** Expected bytes; 0 while unknown. */
  total: number
  done: boolean
}

const downloads = shallowReactive(new Map<string, Download>())

/**
 * The fetch priority of downloads made ahead of need (the kernel, the disk manifest and boot data): low in a build,
 * so they yield to the deck's scripts and styles. A dev server serves hundreds of modules over HTTP/1.1, where Chrome
 * holds low-priority requests back until those finish, so there they keep the default.
 */
export const AHEAD_PRIORITY: RequestPriority = import.meta.env?.PROD ? 'low' : 'auto'

/**
 * Registers a download and returns its updater. A download that starts while nothing else is in flight begins a
 * new batch, so the bar shows the files being fetched now instead of everything fetched since the page opened.
 */
export function trackDownload(name: string, total = 0): (loaded: number, done?: boolean) => void {
  if (![...downloads.values()].some(download => !download.done))
    downloads.clear()
  downloads.set(name, { loaded: 0, total, done: false })
  return (loaded, done = false) => {
    // A server that compresses on the fly sends fewer bytes than the file has; the count is of decoded bytes.
    downloads.set(name, { loaded, total: Math.max(total, done ? loaded : 0), done })
  }
}

export interface DownloadSummary {
  files: number
  filesDone: number
  loaded: number
  /** Sum of the expected sizes, never below what has arrived. */
  total: number
  active: boolean
}

export const linuxDownloads = computed<DownloadSummary>(() => {
  const all = [...downloads.values()]
  return {
    files: all.length,
    filesDone: all.filter(download => download.done).length,
    loaded: all.reduce((sum, download) => sum + download.loaded, 0),
    total: all.reduce((sum, download) => sum + Math.max(download.total, download.loaded), 0),
    active: all.some(download => !download.done),
  }
})

/** Reads a response body to the end, reporting the bytes as they arrive. */
export async function readCounted(response: Response, name: string): Promise<Uint8Array<ArrayBuffer>> {
  const update = trackDownload(name, Number(response.headers.get('content-length')) || 0)
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    update(bytes.length, true)
    return bytes
  }
  const parts: Uint8Array[] = []
  let loaded = 0
  const reader = response.body.getReader()
  try {
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      parts.push(read.value)
      loaded += read.value.length
      update(loaded)
    }
  }
  finally {
    update(loaded, true)
  }
  const bytes = new Uint8Array(loaded)
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.length
  }
  return bytes
}
