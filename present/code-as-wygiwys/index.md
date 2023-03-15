---
theme: eloc
---

## Code as <u>WYSIWYG</u>

what you see is what you get

---

## Code as <u>WYGIWYS</u>

BUT what you get **MAY NOT** be what you see

---

<iframe
  src="https://player.bilibili.com/player.html?aid=70927579&cid=122892471&page=1&high_quality=1"
  scrolling="no"
  border="0"
  frameborder="no"
  framespacing="0"
  allowfullscreen="true"
  class="w-full h-full"
/>

<!--
Adblock

```
player.bilibili.com##DIV[class="bilibili-player-video-recommend"]
player.bilibili.com##DIV[class="bilibili-player-video-pause-panel-container-mask"]
player.bilibili.com##DIV[class="bilibili-player-video-pause-panel-container-qrcode"]
player.bilibili.com##DIV[class="bilibili-player-video-sendjumpbar"]
```
-->

---

<iframe
  scrolling="no"
  src="https://codepen.io/zthxxx/embed/YpbrVe?height=265&theme-id=light&default-tab=result"
  frameborder="no"
  allowtransparency="true"
  allowfullscreen="true"
/>

---

希望：实际逻辑和代码组织有同样的结构

即： 代码希望符合事物自然运行的行为

需要：把实体结构映射到代码结构

---

# DDD

**D**omain **D**riven **D**esign

---

- 领域层（Domain Layer）
- 端口层（Ports Layer）
- 适配器层（Adapters Layer）

<!--
https://insights.thoughtworks.cn/from-sandwich-to-hexagon/

https://airbrake.io/blog/software-design/domain-driven-design

http://wiki.smallcpp.cn/软件工程/DDD%20领域驱动设计与六边形架构.html
-->

---

<div
  class="w-full h-full flex justify-center items-center"
>
  <img src="/images/DDD-structure.png" />
</div>

---

![](/images/DDD-application.jpg)

---

主题：黑 / 白

展示：编辑 / 预览

布局：悬浮 / 磁贴

stateX: A / B / C / ...

...

---


- 每层写 `if` / `else` 判断

- 使用 map 结构

- 状态机 / 策略模式

- 主题化模式

- 控制反转

- 插件模式

---

<iframe
  src="//jsfiddle.net/zthxxx/6a9c3g45/10/embedded/js/"
  allowfullscreen="allowfullscreen"
  allowpaymentrequest
  frameborder="0"
/>

---

<div class="code-container">

```tsx
import Component

class Layout {
  // constructor(Component) {
  //  this.Component = Component
  // }
  render () {
    const Component = this.Component
    if (preview) {
      // do something
    } else {
      // do something
    }

    return (
      <Component preview={preview} />
    )
  }
}
```

<div class="separator" />

```tsx
import Chart

class Component {
  render () {
    if (preview) {
      // do something
    } else {
      // do something
    }

    return <Chart preview={preview} />
  }
}
```

<div class="separator" />

```tsx
import xxx

class Chart {
  render () {
    if (preview) {
      // do something
      return xxx
    } else {
      // do something
      return xxx
    }
  }
}
```

</div>


<style>
  .slidev-layout {
    --slidev-code-font-size: 0.5em;

    .code-container {
      @apply flex flex-row justify-around items-stretch;
      @apply w-full py-4 rounded-xl;
      background: var(--prism-background);
      font-size: 0.9em;

      .separator {
        @apply min-w-1px my-4 bg-gray-300
      }
    }
  }
</style>

---

1. 职责不单一，多种状态 if 判断很面条
2. 感觉抽象或模式不到位，

   不符合「两种状态就是两块不耦合的多态」的直觉
3. 状态多了不易于封闭修改

   上面举例是 if else，实际因为历史原因已经很多 switch case
4. 每层是对外暴露的 API，这种写法也会侵入使用者代码去做判断
5. 没想到如何把多种状态暴露成不同的接口

---

## Webpack

对外暴露，并一定会涉及扩展模式的接口，
<br />
用了大段的 switch 处理不同逻辑
<br />
[WebpackOptionsApply.js](https://github.com/webpack/webpack/blob/v4.41.2/lib/WebpackOptionsApply.js#L73-L197)
<br />
<br />
以及以及 if else 切换模式判断
<br />
[WebpackOptionsApply.js](https://github.com/webpack/webpack/blob/v4.41.2/lib/WebpackOptionsApply.js#L328-L375)

---

## 稍微好点的 Case

相对固定的 内部 模式依然可以用 switch
<br />
[OptionsDefaulter.js](https://github.com/webpack/webpack/blob/v4.41.2/lib/OptionsDefaulter.js#L75-L117)
<br />
<br />
不同模式 链式注册的写法
<br />
[WebpackOptionsApply.js](https://github.com/webpack/webpack/blob/v4.41.2/lib/WebpackOptionsApply.js#L510-L541)
<br />
<br />
(注册一定程度做了分离，但也
多了之后依然很臃肿、样板代码很多
<br />
使用者不能全局看到一共有哪些已注册值/默认值)

---

## Dependency inversion principle

高层次的模块不应该依赖于低层次的模块，他们都应该依赖于抽象；

抽象不应该依赖于具体实现，具体实现应该依赖于抽象

---

`高层模块` (接口)-->  `抽象接口`  <--(实现) `底层模块`
<br />

(领域模型)


---

## 稍微好点但有明显问题的 Case  eslint

https://github.com/eslint/eslint/blob/v6.6.0/lib/rules/index.js

https://github.com/eslint/eslint/blob/v6.6.0/lib/rules/indent.js

---

## 注册式例子

[gulpfile](https://gist.github.com/zthxxx/bc7c77d0801cf8c1b4265f762bd4f6db#file-gulpfile-js)

[rxjs](https://rxjs.dev/guide/overview)

---

## 插件扩展式 生命周期钩子

[vscode](https://code.visualstudio.com/api/extension-guides/overview)

[vuepress](https://vuepress.vuejs.org/zh/plugin/life-cycle.html#ready)

---

给一枝笔式的插件系统设计

oh-my-zsh  直接调用脚本文件

---

拆分成 `行为步骤` 和 `逻辑`
<br />
<sub>一个最细步骤只包含一种逻辑</sub>

组合步骤
<br />
<sub>不再是数据流控制</sub>

<style>
  p {
    text-align: center;
  }
</style>
