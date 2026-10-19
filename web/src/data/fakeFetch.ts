import { vi } from 'vitest'

/** Answers with `files[path]`, where path is the part of the URL after /data/. */
export function fakeFetch(files: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const body = files[url.split('/data/')[1]]
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      json: async () => body,
    }
  })
}
