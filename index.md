---
# https://github.com/slidevjs/slidev/blob/v0.34.3/packages/types/src/config.ts
routerMode: hash
# 16:10
aspectRatio: 1.6
# 1280 / (16:10) * (16:9)
canvasWidth: 1422
selectable: true
layout: default
---

# SLIDES BY ZTHXXX

<div class="scroll">

- *2020.09* [Our Git Operate Proposal](/present/git-operate-proposal)
- *2020.08* [Graphic Design in Code Style](/present/code-design-and-roast)
- *2020.05* [Terminal Concept Guide](/present/terminal-glance) <small>(need local service)</small>
- *2020.02* [A Glance at Git Merkle](/present/git-merkle-glance)
- *2019.11* [Zsh History Search Plugin](https://zsh-history-enquirer.zthxxx.me)
- *2019.11* [You Don't Need to Care Log](https://dont-care-log.zthxxx.me)
- *2019.10* [Code as WYGIWYS](/present/code-as-wygiwys)
<!-- - *2020.06* [Live in Terminal](/present/live-in-terminal) <small>(need local service)</small> -->

</div>

<style>
  .slidev-layout {
    .scroll {
      @apply overflow-y-scroll max-h-[660px];
    }

    h1 {
      @apply mb-5 text-8xl;
    }

    em {
      @apply inline-block mr-2 text-[#bbb];

      letter-spacing: -0.06em;
      font-size: 0.9em;
      font-style: normal;
      font-family: var(--code-font-family);
    }

    small {
      color: #777;
      font-size: 0.5em;
    }
  }
</style>
