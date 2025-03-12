---
theme: eloc
title: Pipe in RxJS
colorSchema: dark
routerMode: hash
---

## 从「管道」开始具象化理解 RxJS

目的 / 定位 / 作用 / 意义

<!--
本次分享能 **获得** 什么？

在项目中想用 rxjs，先跟大家分享下这个库。

[入门] 帮助 **刚接触** rxjs 的初学者抛开互联网上繁杂的 rxjs 概念解释，

换一种简单直观的理解方式来理解 rxjs 的概念、管道的理念，

最终帮助大家在项目中实际使用 rxjs 的能力落地开发代码。
-->

---

### "Think of `RxJS` as `Lodash` for async stream."

<!--
事到如今没人会来讲说我们要推大家用 Lodash，要来讲讲 Lodash 是什么，怎么用
-->

---

### 但，对于 RxJS 仍然缺少直觉

<v-click>
Stream(流) => Pipe(管道)
</v-click>

<!-- 直觉是指「从架构/流程的图形化能几乎 1:1 映射到代码结构/写法」 -->

---
layout: two-cols
---

本次会涉及的部分

- 纯主观的 `rxjs` 是什么
- 形象的管道中的概念
- 作用/意义以及如何使用
- 写法以及对比其他范式
- 案例 Cases

::right::

不会涉及的部分

- 冷流 / 热流 / `multicast`
- `share` / `connect` 等一百个 api
- 进阶技巧与踩坑
- 源码讲解

<br/>

<style>
  .slidev-layout {
    :deep(.col-left) {
      @apply pl-20;
    }
  }
</style>

---

```ts
import { tap, map, fromEvent, switchMap, takeUntil } from 'rxjs'

const subscriber = fromEvent<PointerEvent>(element, 'pointerdown').pipe(
  switchMap(down => {
    const origin = element.position()
    return fromEvent<PointerEvent>(document, 'pointermove').pipe(
      map(move => ({
        left: move.clientX - down.clientX + origin.left,
        top: move.clientY - down.clientY + origin.top,
      })),
      takeUntil(fromEvent(document, 'pointerup')),
    )
  }),
).subscribe(position => {
  setPosition(position)
})
```

<!--
先看一段代码引子，直观感受今天的内容
-->

---

#### 不管之前有没有接触过 `rxjs`， <br/> 忘掉之前网上听说的内容，让我们换一个角度重新理解。


---

### 从现在开始都是「管道」

---

### 概念

- 管道 / 管道模板
- 输出源 / 输出源构造器
- 传送入口

---
layout: two-cols
---

<RiveCanvas
  class='w-[600px] h-[400px]'
  artboard='纯输入输出直线'
/>

::right::

有输入和输出的"一节"管道，

啥也没做

---
layout: two-cols
---

<RiveCanvas
  class='w-[600px] h-[400px]'
  artboard='纯输入输出管道'
/>

::right::

但管道也可以包含逻辑的

但输出只有一个出口

---
layout: two-cols
---

<RiveCanvas
  class='w-[600px] h-[400px]'
  artboard='tap 观察'
/>

::right::

简单点，一个观察者，不修改数据

<v-click>

```ts {all|4-6}{lines:true}
import { tap } from 'rxjs'

subject$.pipe(
  tap((value) => {
    console.log(value)
  }),
).subscribe()
```

</v-click>

---
layout: two-cols
---

<RiveCanvas
  class='w-[596px] h-[400px]'
  artboard='Filter 管道'
/>

::right::

按条件拦截数据， <br/>
但不会修改值的"一节"管道

<v-click>

```ts {all|4-6}{lines:true}
import { filter } from 'rxjs'

subject$.pipe(
  filter((value) => {
    return isGreen(value)
  }),
).subscribe()
```

</v-click>


---
layout: two-cols
---

<RiveCanvas
  class='w-[600px] h-[400px]'
  artboard='map 管道'
/>

::right::

把输入的东西拿来处理， <br/>
往出口丢处理后的新东西的"一节"管道

<v-click>

```ts {all|4-6}{lines:true}
import { map } from 'rxjs'

subject$.pipe(
  map((value) => {
    return toPurple(value)
  }),
).subscribe()
```

</v-click>


---
layout: two-cols
---

<RiveCanvas
  class='w-[700px] h-[800px]'
  artboard='管道模板'
/>

::right::

"管道"的实体是从模板里创建的

<v-click>

```ts {all|3-4,10-14}{lines:true}
import { tap, filter, map } from 'rxjs'

// 编排好了管道的模板
const pipe$ = subject$.pipe(
  tap((value) => console.log(value)),
  filter((value) => isGreen(value)),
  map((value) => toPurple(value)),
)

// 从模板创建管道
pipe$.subscribe()

// 多次创建多个独立管道
pipe$.subscribe()
```

</v-click>

---
layout: two-cols
---

<RiveCanvas
  class='w-[700px] h-[800px]'
  artboard='管道模板'
/>

::right::

完整的"一根"管道是包含输入的 <br/>
`subject$` 是管道的输入， <br/>
是特殊的「`传送入口`」

```ts {*}{lines:true}
import { Subject, tap, filter, map } from 'rxjs'

const subject$ = new Subject<Value>()
// 编排好了管道的模板
const pipe$ = subject$.pipe(...)

// 多次创建多个独立管道
pipe$.subscribe()
pipe$.subscribe()
pipe$.subscribe()

// 传送口，打开盖子输入
subject$.next(value)
```

---
layout: two-cols
---

<RiveCanvas
  class='w-[700px] h-[600px]'
  artboard='Subject'
/>

::right::

完整的"一根"管道是包含输入的 <br/>
`subject$` 是管道的输入， <br/>
是特殊的「`传送入口`」

```ts {all|3,13}{lines:true}
import { Subject, tap, filter, map } from 'rxjs'

const subject$ = new Subject<Value>()
// 编排好了管道的模板
const pipe$ = subject$.pipe(...)

// 多次创建多个独立管道
pipe$.subscribe()
pipe$.subscribe()
pipe$.subscribe()

// 传送口，打开盖子输入
subject$.next(value)
```


---
layout: two-cols
---

<RiveCanvas
  class='w-[600px] h-[600px]'
  artboard='Observable'
/>

::right::

`observable` 输出源的构造器 <br/>
- 可内部产生数据
- 或从外部拿数据输输出

```ts {all}{lines:true}
import { Observable } from 'rxjs'

// observable$ 只是 “输出源构造器”
const observable$ = new Observable<Value>((subscriber) => {
  for (let i = 0; i < 10; i++) {
    subscriber.next(i)
  }
  subscriber.complete()
})

// subscribe 时，输出源才被构造器创建出来
observable$.subscribe()
observable$.subscribe()
observable$.subscribe()
```

---
layout: two-cols
class: 'w-[800px]'
---

<RiveCanvas
  class='w-[700px] h-[800px]'
  artboard='管道模板'
/>

::right::

现在已经完全了解管道模型了

- 一节管道操作 → `tap` / `filter` / `map`
- 管道模板 → `pipe$ = subject$.pipe(...)`
- 创建管道 → `pipe$.subscribe()`
- 传送入口 → `subject$ = new Subject()`
- 通过入口发数据 → `subject$.next(value)`

<style>
  .slidev-layout {
    ul {
      font-size: 2rem;
    }
  }
</style>


---

那么 `rxjs` 管道和 `EventEmitter` 有什么异同？


```ts
const subject$ = new Subject<Value>()
subject$.subscribe(...)
subject$.next(...)

const manager = new EventEmitter()
manager.on('name', ...);
manager.emit('name', ...);
```

---
layout: two-cols
---


```ts
const subject$ = new Subject<Value>()
subject$.subscribe(...)
subject$.next(...)

const manager = new EventEmitter()
manager.on('name', ...);
manager.emit('name', ...);
```

::right::

- 目前基本一样，因为还没接触到核心的**异步编排**
- `Subject` 也是 Topic 的概念，<br/>
  表示这个 `Subject` 传入的东西应该是属于这个主题限制的，<br/>
  `Subject` 通过引用在上层集中管理
- 而 `EventEmitter` 是通过字符串集中管理事件
- 管道是状态机的集合，把状态转换和逻辑封装在管道内部


<style>
  .slidev-layout {
    ul {
      font-size: 2rem;
    }

    :deep(.col-left) {
      width: 600px;
    }
    :deep(.col-right) {
      width: 800px;
      left: -60px;
      position: relative;
    }
  }
</style>

---

### 异步时序性消息的拓扑编排

<div class="flex justify-around items-center flex-row">
```mermaid {scale: 1}
graph LR
    A --> B
    A --> C
    B --> D
    C --> E
    D --> F
    C --> F
    E --> F
```
```mermaid  {scale: 1}
sequenceDiagram
    participant Client
    participant Server
    Note over Client,Server: 竞态：后发先到
    Client->>Server: 请求 A (先发送)
    Client->>Server: 请求 B (后发送)
    Server-->>Client: 响应 B (先返回)
    Server-->>Client: 响应 A (后返回)
```
</div>

---

![pipe-state](/img/pipe-state.svg)

<style>
  .slidev-layout {
    img {
      width: 660px;
      filter: invert();
    }
  }
</style>


---
layout: two-cols
---

<RiveCanvas
  class='w-[700px] h-[800px]'
  artboard='switchMap'
/>

::right::

嵌套管道: <br/>
<small>可内部创建管道 或消费外部管道</small>

- `concatMap`: 排队，阻塞等待 <br/>
  *(一个管道完了才会开始下一个管道，都会执行)*
- `mergeMap`: 并行，穿插输出 <br/>
  *(多个管道可以同时输出)*
- `switchMap`: 抢占打断，新的优先，优先处理新任务  <br/>
  *(旧的管道没有完成，就直接移动走切换成新的管道)*
- `exhaustMap`: 请勿打扰，占用时不接受输入 <br/>
  *(没有完成时来新的管道直接被丢弃)*

<style>
  .slidev-layout {
    ul {
      font-size: 2rem;
    }
    em {
      opacity: 0.6;
      font-size: 80%;
    }

    :deep(.col-left) {
      width: 600px;
    }
    :deep(.col-right) {
      width: 800px;
      left: -60px;
      position: relative;
    }
  }
</style>

---


Marble Diagrams 弹珠图

![rxjs Marble](/img/rxjs-marbles.png)

<style>
  .slidev-layout {
    img {
      width: 800px;
    }
  }
</style>

<!--
- https://www.sglavoie.com/posts/2023/10/01/first-steps-with-rxjs/
-->

---
layout: iframe

# the web page source
url: https://rxjsmarbles.dev/switchMap
---

---

```ts
import { tap, map, fromEvent, switchMap, takeUntil } from 'rxjs'

const subscriber = fromEvent<PointerEvent>(element, 'pointerdown').pipe(
  switchMap(down => {
    const origin = element.position()
    return fromEvent<PointerEvent>(document, 'pointermove').pipe(
      map(move => ({
        left: move.clientX - down.clientX + origin.left,
        top: move.clientY - down.clientY + origin.top,
      })),
      takeUntil(fromEvent(document, 'pointerup')),
    )
  }),
).subscribe(position => {
  setPosition(position)
})
```

<!-- 再回头读这段代码 -->


---

Cases:

- 拖拽交互+安全区
- 搜索请求竞速
- 指标收集多个阶段依赖
- 网络请求 react-query 能力
