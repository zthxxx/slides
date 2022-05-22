---
theme: ./
---

## `eloc`

_the eloquence theme_

---

[`eloc`](https://github.com/amio/eloc) <--> [`Slidev`](https://sli.dev/)

> a theme implementation of [eloc](https://github.com/amio/eloc) for [Slidev](https://sli.dev/)

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

`npm i slidev-theme-eloc`

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

Press <kbd><carbon-text-annotation-toggle/></kbd> to __edit me__ :)

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
    kbd {
      @apply pl-[0.35em] pr-[0.18em];
    }

    .slidev-icon {
      @apply align-middle;
    }
  }
</style>

---

## Customization


```css
### Write inline style within markdown

<style>
  .slidev-layout {
    &::before {
      content: '';  background: center/cover url(...);
      /* you can use full ability with Windi CSS  */
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
      @apply opacity-75;
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
  https://github.com/slidevjs/slidev/blob/v0.34.3/packages/slidev/node/plugins/markdown.ts#L188-L189
-->
<style no-scoped>
  #slide-content {
    @apply overflow-visible;
  }
</style>

---

<p>
  <a href="https://github.com/zthxxx" target="_blank" rel="noopener">
    <img
      alt="zthxxx"
      src="https://avatars.githubusercontent.com/u/15135943"
      class="w-52 h-52 rounded-full border-2 border-gray-300"
    />
  </a>
</p>

[![zthxxx](https://badgen.net/badge/github/zthxxx/blue?icon=github&label&scale=2)](https://github.com/zthxxx)

[ [slidev-theme-eloc](https://github.com/zthxxx/jovial) · [eloc-slidev.vercel](https://eloc-slidev.vercel.app) ]

---

<p>
  <a href="https://github.com/amio/eloc" target="_blank" rel="noopener">
    <img
      alt="amio"
      src="https://avatars.githubusercontent.com/u/215282"
      class="w-52 h-52 rounded-full border-2 border-gray-300"
    />
  </a>
</p>


[![amio](https://badgen.net/badge/github/amio/blue?icon=github&label&scale=2)](https://github.com/amio)

[ [amio/eloc](https://github.com/zthxxx/jovial) · [eloc.vercel](https://eloc.vercel.app) ]
