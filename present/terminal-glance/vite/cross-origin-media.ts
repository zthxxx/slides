import type { ElementNode } from '@vue/compiler-core'
import { NodeTypes } from '@vue/compiler-core'

/** The elements whose `src` the page fetches as a subresource and that take a `crossorigin` attribute. */
const MEDIA = new Set(['img', 'video', 'audio'])

/** `https://…`, `http://…` and `//…`; paths and `data:` URLs stay on the deck's origin. */
const EXTERNAL = /^(?:https?:)?\/\//i

/**
 * Template compiler transform: makes every `<img>`, `<video>` and `<audio>` with a static `src` on another site a CORS
 * request (`crossorigin="anonymous"`), in the slides' Markdown (`![](https://…)` is an `<img>` by then) and in
 * components alike. Under the deck's `Cross-Origin-Embedder-Policy: require-corp` (docs/isolation.md) such a request
 * needs only `Access-Control-Allow-Origin`, which the image hosts checked send whether or not they also send
 * `Cross-Origin-Resource-Policy`; without the attribute, a host that sends only the former is blocked.
 * An element that sets `crossorigin` keeps its own value. A bound `:src` is unknown at compile time, so an element
 * with one sets the attribute itself (components/WebVideo.vue).
 * The parameter is typed by `type` alone: the workspace installs more than one @vue/compiler-core, and Slidev's option
 * types (@slidev/types@53.1.0 `SlidevPluginOptions.vue`) may name a different copy than this import; `NodeTypes` and
 * the AST shapes used here are the same in all of them.
 */
export function crossOriginMedia(node: { type: number }): void {
  if (node.type !== NodeTypes.ELEMENT)
    return
  const element = node as ElementNode
  if (!MEDIA.has(element.tag))
    return
  let src: string | undefined
  for (const prop of element.props) {
    if (prop.type === NodeTypes.ATTRIBUTE) {
      if (prop.name.toLowerCase() === 'crossorigin')
        return
      if (prop.name === 'src')
        src = prop.value?.content
    }
    else if (prop.name === 'bind' && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION && prop.arg.content.toLowerCase() === 'crossorigin') {
      return
    }
  }
  if (!src || !EXTERNAL.test(src.trim()))
    return
  element.props.push({
    type: NodeTypes.ATTRIBUTE,
    name: 'crossorigin',
    nameLoc: element.loc,
    value: { type: NodeTypes.TEXT, content: 'anonymous', loc: element.loc },
    loc: element.loc,
  })
}
