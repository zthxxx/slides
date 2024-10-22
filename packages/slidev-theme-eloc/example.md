---
# https://github.com/slidevjs/slidev/blob/v51.1.1/packages/types/src/config.ts#L10
theme: ./
layout: default
title: The `eloc` Theme for Slidev
---

## `eloc`

_the eloquence theme_

---

## [`eloc`](https://github.com/amio/eloc) <--> [`Slidev`](https://sli.dev/)

> A theme implementation of [eloc](https://github.com/amio/eloc) CLI for [Slidev](https://sli.dev/)

---

#### "True __eloquence__,<br /> does not consist in saying great things<br/> in a sublime style,

---

#### but in a simple style."

_— Oliver Goldsmith_

---

## Meet `eloc`

A markdown presentation authoring theme

---

for presenters who

1. __focus__ on writing
2. present in a __concise__ style

---

**`npm i slidev-theme-eloc`**

```yaml
# slides.md
---
theme: eloc
---

Just change the theme in your slide's frontmatter
```

---

<kbd>D</kbd> for __DARK MODE__

---

<kbd>O</kbd> for __OVERVIEW__

---

Click <kbd><carbon-text-annotation-toggle/></kbd> or Press <kbd>Tab</kbd> to __edit me__ :)

<div class="absolute bottom-14 left-85">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 254 262" class="w-[250px] h-[200px]">
    <g
      stroke-linecap="round" stroke="#999" stroke-width="1.5"
      transform="translate(244.6 10.8) rotate(0 -117.2 120.5)"
    >
      <path d="M0.0 -0.8 C-38.8 39.5, -195.7 201.6, -234.6 242.0" stroke-dasharray="8 9"></path>
      <path d="M-223.8 213.2 C-224.7 221.7, -228.6 226.4, -232.6 242.4"></path>
      <path d="M-209.1 227.4 C-213.1 232.9, -220.2 234.4, -232.6 242.4"></path>
    </g>
  </svg>
</div>

<style>
  .slidev-layout {
    .slidev-icon {
      @apply align-middle;
    }
    kbd:has(> .slidev-icon:only-child) {
      padding-inline: 0.2em 0.15em;
    }
  }
</style>

---

## Customization

```markdown
### Write inline style within markdown

<style>
  .slidev-layout {
    &::before {
      content: '';  background: center/cover url(...);
      /* you can use full ability with UnoCSS  */
      @apply absolute block -z-1 w-screen h-screen min-w-full min-h-full;
    }
    pre { opacity: 0.8 }
  }
</style>
```

<style>
  .slidev-layout {
    @apply overflow-visible;
    filter: invert();

    pre {
      @apply opacity-80;
    }

    &::before {
      @apply absolute block -z-1 w-screen h-screen min-w-full min-h-full;
      content: '';
      filter: invert();
      background: center/cover url(https://el-capitan.now.sh);
    }
  }
</style>

<!--
  bypass transform to scoped style in slidev
  https://github.com/slidevjs/slidev/blob/v51.1.1/packages/slidev/node/syntax/transform/in-page-css.ts#L15-L16
-->
<style no-scoped>
  #slide-content {
    @apply overflow-visible;
  }
</style>

---
background:
  image: https://el-capitan.now.sh
  invertContent: true
---

## Background

Just change in slide's frontmatter, like:

<div class="flex justify-center items-start gap-8">

```yaml
---
background: https://el-capitan.now.sh
---

# or pure color

---
background: #999
---
```

```yaml
---
background:
  # `image: <image url> or <gradient>`
  # or `color: <color>`
  image: https://el-capitan.now.sh
  dim: true  # dim color for image
  # invert content color on background
  invertContent: true
---
```

</div>

<style>
  .slidev-layout {
    pre {
      @apply opacity-80;
    }
    p {
      @apply mt-0;
    }
  }
</style>

---
layout: two-cols
class: flex flex-col justify-center items-center
---

<p>
  <a href="https://github.com/amio/eloc" target="_blank" rel="noopener">
    <img
      alt="amio"
      src="https://avatars.githubusercontent.com/u/215282"
      class="mb-2 w-52 h-52 rounded-full border-2 border-gray-300"
    />
  </a>
</p>

[![amio](https://badgen.net/badge/github/amio/blue?icon=github&label&scale=2)](https://github.com/amio)

[ [amio/eloc](https://github.com/amio/eloc) ]

[ [eloc.vercel](https://eloc.vercel.app) ]

::right::

<p>
  <a href="https://github.com/zthxxx" target="_blank" rel="noopener">
    <img
      alt="zthxxx"
      src="https://avatars.githubusercontent.com/u/15135943"
      class="mb-2 w-52 h-52 rounded-full border-2 border-gray-300"
    />
  </a>
</p>

[![zthxxx](https://badgen.net/badge/github/zthxxx/blue?icon=github&label&scale=2)](https://github.com/zthxxx)

[ [slidev-theme-eloc](https://www.npmjs.com/package/slidev-theme-eloc) ]

[ [eloc-slidev.vercel](https://eloc-slidev.vercel.app) ]

<style>
  .slidev-layout {
    p {
      margin-block: 1rem;
    }
  }
</style>
