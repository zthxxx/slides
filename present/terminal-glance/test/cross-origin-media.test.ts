import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { compile, createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { crossOriginMedia } from '../vite/cross-origin-media'

/** Compiles a slide's template as the deck's Vite config does, renders it, and reads the attributes of its one element. */
async function renderedAttributes(template: string): Promise<Record<string, string>> {
  const render = compile(template, { nodeTransforms: [crossOriginMedia] })
  const html = await renderToString(createSSRApp({ render }))
  let attributes: Record<string, string> = {}
  await new HTMLRewriter()
    .on('*', { element(element) { attributes = Object.fromEntries(element.attributes) } })
    .transform(new Response(html))
    .text()
  return attributes
}

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

const media = fc.constantFrom('img', 'video', 'audio')
const external = fc.oneof(
  fc.webUrl({ validSchemes: ['http', 'https'] }),
  fc.webUrl({ validSchemes: ['https'] }).map(url => url.replace(/^https:/, '')),
)
const local = fc.oneof(
  fc.webPath().map(path => `/${path.replace(/^\/+/, '')}`),
  fc.stringMatching(/^(?:\.\/)?[\w-]{1,12}(?:\/[\w-]{1,12}){0,3}\.(?:png|svg|webp|mp4)$/),
  fc.base64String({ minLength: 4, maxLength: 24 }).map(data => `data:image/png;base64,${data}`),
)

describe('media from other sites in slides and components', () => {
  test('an external image, video or audio is requested with CORS, without cookies', async () => {
    await fc.assert(fc.asyncProperty(media, external, async (tag, src) => {
      expect((await renderedAttributes(`<${tag} src="${escape(src)}" alt="figure" />`)).crossorigin).toBe('anonymous')
    }))
  })

  test('media on the deck\'s own origin is left as written', async () => {
    await fc.assert(fc.asyncProperty(media, local, async (tag, src) => {
      expect(await renderedAttributes(`<${tag} src="${escape(src)}" />`)).not.toHaveProperty('crossorigin')
    }))
  })

  test('an element that sets crossorigin keeps its own value', async () => {
    const own = fc.oneof(
      fc.constantFrom('anonymous', 'use-credentials', '').map(value => ({ attribute: `crossorigin="${value}"`, value })),
      fc.constant({ attribute: 'crossorigin', value: '' }),
      fc.constantFrom('anonymous', 'use-credentials').map(value => ({ attribute: `:crossorigin="'${value}'"`, value })),
    )
    await fc.assert(fc.asyncProperty(media, external, own, async (tag, src, { attribute, value }) => {
      expect((await renderedAttributes(`<${tag} ${attribute} src="${escape(src)}" />`)).crossorigin).toBe(value)
    }))
  })

  test('other elements with an external src are left as written', async () => {
    await fc.assert(fc.asyncProperty(fc.constantFrom('iframe', 'embed', 'source', 'track'), external, async (tag, src) => {
      expect(await renderedAttributes(`<${tag} src="${escape(src)}" />`)).not.toHaveProperty('crossorigin')
    }))
  })
})
