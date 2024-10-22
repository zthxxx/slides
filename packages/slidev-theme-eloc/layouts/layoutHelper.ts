/**
 * Resolve urls from frontmatter and append with the base url
 * `/xxxx` => `${import.meta.env.BASE_URL}xxxx`
 */
export function resolveAssetUrl(url: string) {
  if (url.startsWith('/'))
    return import.meta.env.BASE_URL + url.slice(1)
  return url
}

export type Background =
  /** color or image url */
  | string
  | (
    | {
      /** css color string */
      color?: string;
    }
    | {
      /** pure image url, or css `url(...)`, or css background-image sytax */
      image?: string;
      /** whether to dim color of background image () with a linear-gradient */
      dim?: boolean;
    }
  )
  & {
    /** whether to invert color of slide content on background */
    invertContent?: boolean;
  }

/**
 * - `/xxxx` => `url(${import.meta.env.BASE_URL}xxxx)`
 * - `https://xxxx` => `url(https://xxxx)`
 * - `url(/xxxx)` => `url(${import.meta.env.BASE_URL}xxxx)`
 * - `url(https://xxxx)` => `url(https://xxxx)` (not modify)
 * - `linear-gradient(...), url(https://xxxx), url(/xxxx)` => `linear-gradient(...), url(https://xxxx), url(${import.meta.env.BASE_URL}xxxx)`
 */
const formatImageString = (input: string): string => {
  // If input doesn't contain "url(", treat it as a plain URL.
  if (input.startsWith('/')) {
    return `url(${resolveAssetUrl(input)})`;
  }
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return `url(${input})`;
  }

  // Replace all occurrences of url(...) in the string.
  return input.replace(/url\(\s*([^)]*?)\s*\)/g, (_match, urlContent: string) => {
    // Clean up any extra spaces and remove surrounding quotes if they exist.
    let cleaned = urlContent.trim();
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1);
    }
    // Use the existing resolveAssetUrl function for the conversion.
    const resolved = resolveAssetUrl(cleaned);
    return `url(${resolved})`;
  });
}

/**
 * ref: https://github.com/slidevjs/themes/blob/%40slidev/theme-default%40v0.25.0/packages/theme-default/layoutHelper.ts
 */
export function formatBackground(background?: Background): {
  backgroundColor?: string;
  invertContent?: boolean;
  backgroundImage?: string;
} {
  if (!background) {
    return {}
  }
  if (typeof background === 'string') {
    const isColor = ['#', 'rgb', 'hsl'].some(v => background.indexOf(v) === 0)
    if (isColor) {
      return {
        backgroundColor: background,
      }
    }
    return formatBackground({
      image: background,
    })
  }

  if ('color' in background && background.color) {
    return {
      backgroundColor: background.color,
      invertContent: background.invertContent,
    }
  }

  if ('image' in background && background.image) {
    const backgroundImage = formatImageString(background.image)
    return {
      backgroundImage: background.dim
        ? `linear-gradient(#0005, #0008), ${backgroundImage}`
        : backgroundImage,
      invertContent: background.invertContent,
    }
  }

  return {}
}
