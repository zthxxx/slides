# Cross-origin isolation 与 guest 的 CPU

在 Chrome、Firefox 和 Safari 里，只要页面是 cross-origin isolated，deck 的 Linux 就跑在 4 个 CPU 上 (手机上 2 个)；其他情况下跑在 1 个 CPU 上。
本文说明浏览器为什么要求 cross-origin isolation、它带来的其他影响与限制、页面如何获得它、各部分运行在哪个线程、这对 slides 内容提出的规则，以及途中遇到的问题，每个问题都附上症状

4 个 CPU 带来的变化是：有两个终端的 slide，两个 prompt 出现所需的时间减半；并行任务的速度是 1 个 CPU 时的 3.5 倍；单个程序和 1 个 CPU 时一样快；boot 多花约 0.25 s。实测数据见 [performance.md](./performance.md#4-个-cpu)


## 为什么需要 cross-origin isolation

unkernel 0.2.0 可以让 guest 跑在多个 CPU 上，每个 CPU 各占一个线程，共用同一块内存 (`createKernel({ cpus })`)。这对页面有两个要求 (unkernel@0.2.0-261124-c08e977 `webCpuBlocker`)：

- **需要 `SharedArrayBuffer`**，而浏览器只把它提供给 cross-origin isolated 的页面，也就是 document 响应带有 `Cross-Origin-Opener-Policy: same-origin` 和一个 `Cross-Origin-Embedder-Policy` 的页面
- **需要一个可以阻塞的线程**。SMP Linux 的各个 CPU 会互相等待，比如等另一个 CPU 释放它持有的锁，或者等另一个 CPU 做完请它做的事。
  在 unkernel 里，这种等待会阻塞等待方 CPU 所在的线程 (`memory.atomic.wait32`，即 wasm 的 `Atomics.wait`)，直到另一个 CPU 把它唤醒。页面主线程不允许阻塞，所以有多个 CPU 时 kernel 跑在 worker 里。
  CPU 0 空闲时等待其他 CPU 是例外：它不阻塞，用的是 `Atomics.waitAsync`，`webCpuBlocker` 也会检查这个接口。只有 1 个 CPU 时没有别的 CPU 可等，所以 kernel 可以跑在页面主线程上

页面是 cross-origin isolated、且 `webCpuBlocker({ worker: true })` 没有发现缺少的条件时，`runtime/kernel.ts` (`guestCpus`) 申请 4 个 CPU (手机上 2 个，与 unkernel 自己页面的建议一致)；否则 kernel 以 1 个 CPU 跑在页面主线程上。CPU 多于 1 个时，boot 界面的 “Boot Linux” 一行会显示 CPU 数量


## 浏览器为什么要求这两个响应头

浏览器只给 cross-origin isolated 的页面提供线程间共享的内存，原因是 Spectre：共享内存能做出纳秒级的计时器，有了它，页面可以读出同一进程里本来无权读的数据。两个响应头保证进程里没有这样的数据，浏览器才把共享内存交给页面

受限制的只有共享内存一项，unkernel 用到的另外两项能力都建立在它之上：

- `SharedArrayBuffer` 就是共享内存本身
- wasm 线程使用的 `WebAssembly.Memory({ shared: true })`，底层也是 `SharedArrayBuffer`
- `Atomics.wait` 只能作用在 `SharedArrayBuffer` 上

页面主线程不能调用 `Atomics.wait` 是另一条规则 (页面主线程的 `[[CanBlock]]` 为 false)，目的是不让页面卡死，与安全无关


### Spectre 如何读取数据

CPU 遇到分支时按预测往下执行，预测错了再撤销结果，但执行期间载入缓存的内容不会撤销。页面里的 JS 可以借此越界读出一个字节：

1. 用合法的下标反复调用 `if (i < arr.length) { probe[arr[i] * 4096] }`，让分支预测器认为条件总是成立
2. 传入越界的下标。CPU 按预测执行了 `arr[i]`，读到越界地址上的字节 `secret`，并访问了 `probe[secret * 4096]`
3. CPU 发现预测错误，撤销结果，JS 看不到 `secret`；但 `probe` 里第 `secret` 个位置已经在缓存里
4. 依次访问 `probe` 的 256 个位置并计时，最快的位置就是 `secret`

这种读取有两个前提：

- **只能读同一进程里的内存**：越界读发生在被撤销的执行里，JS 的边界检查拦不住它
- **需要精确的计时器**：缓存命中与未命中只差几十纳秒


### 共享内存就是计时器

Spectre 在 2018 年 1 月公开后，浏览器降低了 `performance.now()` 的精度并加入抖动，同时关闭了 `SharedArrayBuffer`。
共享内存可以绕过前一项措施：一个 worker 不停地给共享内存里的计数器加 1，另一个线程在一次内存访问前后各读一次计数器，两次读数之差就是耗时，精度接近纳秒。这个计时器只由普通的内存读写组成，要降低它的精度，只能拖慢共享内存本身


### 两个响应头各管一个数据来源

Spectre 只能读本进程的内存，所以问题在于页面的进程里会不会混进它无权读的数据。数据有两个来源，各由一个响应头负责：

| 来源 | 数据如何进入进程 | 负责的响应头 |
| --- | --- | --- |
| 跨站子资源 | `<img>`、`<script>`、`<video>`、`<link>` 发出 `no-cors` 请求，默认带着用户在对方站点的 cookie；JS 读不到响应内容，但响应的字节已经在页面的进程里 | `Cross-Origin-Embedder-Policy: require-corp`：每个跨站资源都要由对方用 CORP 或 CORS 明确同意，否则不加载 |
| 跨站窗口 | `window.open` 打开的弹窗和它的 opener 互相持有引用，浏览器可能把它们放进同一个进程 | `Cross-Origin-Opener-Policy: same-origin`：页面独占一个 browsing context group，浏览器可以把它放进单独的进程 |

COEP 的另一个取值 `credentialless` 换了一种做法：跨站的 `no-cors` 请求不带 cookie，拿到的只有公开内容，所以不需要对方同意

两个响应头都满足时，`crossOriginIsolated` 为 `true`。这时即使用 Spectre 加上精确计时，能读到的也只有页面本来就能读的数据，所以浏览器开放：

- `SharedArrayBuffer`，以及用 `postMessage` 把它传给其他线程
- wasm 的 shared memory 与线程
- 精度更高的 `performance.now()`：hr-time 规范 (coarsen time) 把精度下限从 100 µs 放宽到 5 µs
- `performance.measureUserAgentSpecificMemory()`

浏览器默认不启用这两项限制：默认启用 COEP 会让不发送 CORP 的 CDN 图片、第三方脚本和嵌入的视频都无法加载，而大多数页面用不到共享内存。只有页面作者知道页面会加载什么，所以由页面自己声明

各浏览器重新开放 `SharedArrayBuffer` 的版本 (mdn/browser-compat-data `javascript/builtins/SharedArrayBuffer.json`)：Firefox 79、Safari 15.2 以这两个响应头为条件；Chrome 桌面版 68 依靠 Site Isolation (每个站点一个进程) 开放、不要求响应头，跨站子资源仍会进入页面的进程，从 Chrome 92 起同样要求这两个响应头


## 两个响应头的其他影响与限制

页面一旦 cross-origin isolated，下面这些影响与响应头由谁发送无关


### COEP 的影响

- **跨站子资源**：图片、脚本、样式、字体、视频要由对方用 CORP 或 CORS 同意，规则见 [Slides 内容的规则](#slides-内容的规则)
- **iframe**：被嵌入的页面自己也要发送 COEP，跨站的还要发送 `Cross-Origin-Resource-Policy: cross-origin`。
  大多数第三方组件 (视频、代码演示、社交媒体) 和普通的 GitHub Pages 站点都不发送，所以嵌不进来；同一 origin 上不发送 COEP 的页面也嵌不进来
- **Worker 脚本**：worker 脚本的响应也要带 COEP，否则 worker 不会启动 (见 [遇到的问题与 deck 的处理](#遇到的问题与-deck-的处理))
- **第三方统计和挂件脚本**：对方既不发送 CORP、也不支持 CORS 时，同样不加载


### COOP 的影响

- **跨站窗口之间没有引用**：deck 用 `window.open` 打开的跨站窗口、打开 deck 的跨站页面，拿到的 `window.opener` 和窗口引用都为空，也不能通过它们 `postMessage`。依赖弹窗回传结果的登录 (OAuth) 和支付流程会因此中断
- **同源窗口不受影响**：Slidev 的观众窗口与 presenter 窗口 (@slidev/client@53.1.0 `state/syncState.ts`)、deck 的 Step 转发 (`runtime/relay.ts`) 都通过 `BroadcastChannel` 通信，它只要求同源
- 带 `rel="noopener"` 的外链本来就不保留 opener，不受影响


### 页面自身的变化

- **`document.domain` 不能再修改**
- **被其他站点嵌入时只有 1 个 CPU**：cross-origin isolation 要从最外层页面开始，嵌在普通页面 iframe 里的 deck 不是 cross-origin isolated


### 响应头只能随 HTTP 响应送达

- COOP 和 COEP 只认 HTTP 响应头：`<meta http-equiv>` 对它们无效，页面加载后运行的脚本也补不上
- 一次加载是否 cross-origin isolated，由这次 document 响应决定。没有带上响应头的加载，只能再 navigate 一次才能获得
- Service worker 只能给经过它的请求加响应头。首次访问时它还没有安装，hard reload 时浏览器绕过它，这两种加载都不经过它


## 页面如何获得 cross-origin isolation

Deck 发送的响应头与 unkernel.dev 服务端发送的相同: `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp`

| 位置 | 谁发送响应头 | 首次加载 |
| --- | --- | --- |
| unkernel.dev，作为对照 | 它的服务端 (Vercel) | 4 个 CPU |
| Dev server | Vite，`vite.config.ts` 里的 `server.headers` | 4 个 CPU |
| GitHub Pages 上的构建产物 | service worker `public/coi-sw.js` | 自动刷新一次，之后 4 个 CPU |

GitHub Pages 不能配置响应头，所以构建产物这样处理：

- **`public/coi-sw.js`** 给 deck 的 document (`navigate` 请求) 和 worker 脚本 (destination 为 `worker`) 加上这两个响应头。
  页面的其他请求 (`cors`、`no-cors`: fetch、脚本、样式、图片、字体) 通过 ServiceWorker static routing (Chrome 123+) 直接走网络，不唤醒它；不支持 static routing 的浏览器里，由它的 fetch handler 原样放行
- **`runtime/isolate-page.js`** 由 `vite.config.ts` (`isolatePage`) 内联到构建产物 `index.html` 的最前面，赶在 app 的脚本之前运行，以 deck 的 base 作为 scope 注册这个 worker。
  没有经过 worker 的加载 (比如首次访问) 不是 cross-origin isolated，所以 worker 一进入 active 状态，脚本就刷新页面，每个 tab session 最多刷新一次 (sessionStorage)。刷新后仍未获得 cross-origin isolation 的加载以 1 个 CPU 运行，不再刷新；没有 sessionStorage 时不刷新
- **更新会替换旧的 worker**。浏览器绕过 HTTP cache 获取 worker 脚本 (`updateViaCache: 'none'`)，脚本一有变化就立即接管 (`skipWaiting`、`clients.claim`)，所以不会有页面停留在旧版本。`isolate-page.js` 还会 unregister deck scope 下的其他所有 registration，比如旧的脚本 URL 或旧的 scope 留下的
- **Dev server 不需要 worker**。Dev 页面会 unregister 早期版本的 deck 在同一 origin 上注册过的 `coi-sw.js` (`setup/main.ts`)

`require-corp` 是 Chrome、Firefox 和 Safari 都支持的 embedder policy；Safari 不支持 `credentialless`，与它配套的 iframe 变体 (`<iframe credentialless>`) 只有 Chromium 支持


## 各部分运行在哪个线程

| 部分 | 1 个 CPU | 4 个 CPU |
| --- | --- | --- |
| Kernel | 页面主线程 | `runtime/kernel-worker.ts`，一个 Web Worker；每多一个 CPU，unkernel 再启动一个 worker |
| Disk (`disk.ts`) | 页面主线程 | kernel 所在的 worker |
| 获取 image 的文件 (`image-source.ts`) | 页面主线程 | 页面主线程 |
| Kernel 的加载 | 边下载边编译 | 打上 SMP patch 后再编译 |

- **Kernel 的 worker 由 deck 自己实现**。unkernel 的 worker 模式 (`worker: true`) 只接受它自己构造的 disk spec (一个文件、按 range 读取的 HTTP image、它的 IndexedDB data disk)，接受不了 deck 分 chunk 发布、带 boot bundle 的 image。所以 `kernel-worker.ts` 在一个 worker 里以 inline 方式运行 unkernel，disk 与 1 个 CPU 的路径相同
- **文件始终在页面主线程上获取**，无论 kernel 跑在哪个线程：index.html 的 preload 和终端的进度条都归页面管理。
  Worker 按文件名请求文件 (`load`)，页面把发布时的字节复制一份传回去 (`file`)。消息定义在 `kernel-worker-protocol.ts`，页面一侧的实现在 `kernel-worker-host.ts`
- **每次 `pull` 跨线程传一个 pty 输出 chunk**。页面这边的 stream 在终端取走上一个 chunk 后才请求下一个，所以终端处理不过来时 guest 仍会等待，和 inline 的 pty 一样
- **SMP kernel 由 bundle 里的 patch 生成**。`unkernel.wasm` 里有单 CPU 的 kernel，还在一个 custom section (`unkernel.kernel.smp.kwpatch`) 里带着把它变成 SMP 的 patch。
  `loadKernelModule(response, { smp: true })` 读完整个下载内容，应用 patch (约 90 ms) 后编译结果；1 个 CPU 的路径则边下载边编译


## Slides 内容的规则

在 `require-corp` 下，外站资源只有满足以下条件之一才会加载：响应带 `Cross-Origin-Resource-Policy: cross-origin`；或者以 CORS 方式请求，且响应带 `Access-Control-Allow-Origin` (见 [authoring.md](./authoring.md#外站资源))

| 资源 | 请求方式 | 能加载的原因 |
| --- | --- | --- |
| Google Fonts 的样式表和字体文件、jsdelivr 的 favicon | 由 CSS 和 `<link>` 发出，不经过模板 | 它们发送 `Cross-Origin-Resource-Policy: cross-origin` |
| 结尾 slide 的 GitHub 头像和 badgen 徽章 | 模板里的 `<img>` (徽章是 Markdown 图片)，编译时自动带上 `crossorigin="anonymous"` | 它们发送 `Access-Control-Allow-Origin: *`；badgen 不发送 CORP |
| botmux 的 demo 视频 (`WebVideo.vue`) | `src` 是绑定值，组件自己写 `crossorigin="anonymous"` | GitHub Pages 发送 `Access-Control-Allow-Origin: *` |

两种条件对应两条路径：

- **CORP**：资源所在的站点用它声明哪些站点可以嵌入这个资源。`same-origin`、`same-site` 用来限制嵌入，`cross-origin` 表示任何站点都可以。
  没有 COEP 的页面不检查 CORP，缺少这个响应头时资源照常加载，所以大多数站点不发送它；希望资源也能用在 cross-origin isolated 页面里的公共 CDN 才会发送 `cross-origin`，比如上表的 Google Fonts、jsdelivr 和 GitHub 头像
- **`crossorigin` 属性**：`<img>`、`<video>`、`<script>`、`<link>` 带上 `crossorigin="anonymous"` 后，请求从 `no-cors` 变为 `cors`，跨站时不带 cookie。
  对方在响应里返回 `Access-Control-Allow-Origin` 就表示同意，不再需要 CORP。没有这个属性时，响应里的 `Access-Control-Allow-Origin` 不起作用，badgen 徽章就会被拦下

Deck 在模板编译时统一加上这个属性：`vite/cross-origin-media.ts` 由 `vite.config.ts` 的 `slidev.vue` 交给 Slidev 的 Vue 插件，slides 的 Markdown 和组件模板都经过它。
`src` 指向其他站点的 `<img>`、`<video>`、`<audio>` 带上 `crossorigin="anonymous"`，Markdown 图片 `![](https://…)` 也一样；已经写了 `crossorigin` 的元素保持原值；`src` 是绑定值 (`:src`) 时编译期无法判断，由组件自己写这个属性

统一走 CORS 的依据：2026-11 抽查的常用图床和 CDN 里，发送 CORP 的站点 (Google Fonts、jsdelivr、unpkg、GitHub 头像、raw.githubusercontent.com、shields.io、Unsplash) 都同时发送 `Access-Control-Allow-Origin`；wikimedia、simpleicons、badgen、GitHub Pages 只发送后者。
只发送 CORP 的站点会因为这个属性加载失败，它的资源要放进 deck 的 `public/`

编写 slides 时遵守以下规则：

- 不嵌入外站的 iframe：只有对方站点为这个 embedder policy 主动放行，它才能加载，而 GitHub Pages 上的站点做不到
- 外站图片直接写成 Markdown 图片 `![](https://…)`，不需要手写 `crossorigin`
- 引入新的外站资源之前，用 `curl -sI <url>` 检查：模板里的图片、视频、音频要求响应带 `Access-Control-Allow-Origin`，CSS 和 `<link>` 引用的资源要求响应带 `Cross-Origin-Resource-Policy: cross-origin`。不满足时，把资源放进 deck 的 `public/`，或者换一个来源


## 遇到的问题与 deck 的处理

| 症状 | 原因 | Deck 的处理 |
| --- | --- | --- |
| 控制台输出 `[host] this kernel is not SMP: 4 CPUs asked, it runs on one`；`nproc` 输出 1 | Kernel 以已经编译好的 module 交给 unkernel，unkernel 会原样使用它：SMP patch 是打在字节上的 | 4 个 CPU 的路径用 `loadKernelModule(…, { smp: true })` |
| Kernel 的 worker 始终没有启动，它的脚本报 `net::ERR_BLOCKED_BY_RESPONSE` | Cross-origin isolated 的页面只在 worker 脚本的响应也带 embedder policy 时才启动 worker | Service worker 给 worker 脚本也加上这两个响应头；static routing 把 `same-origin` 请求 (module worker 脚本) 留给它处理 |
| 直接用 iframe 嵌入 botmux 页面，报 `ERR_BLOCKED_BY_RESPONSE` (Chrome) | 在 COEP 下，cross-origin iframe 只有对方站点主动放行才能加载；只有 Chromium 的 `<iframe credentialless>` 能绕过这一点，Firefox 和 Safari 没有这种 iframe | Deck 不嵌入任何 iframe：slide 播放该页面的视频，并附上页面链接 |
| 图片加载失败，报 `ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep` | 图片来自不发送 CORP 的站点，且以 `no-cors` 方式请求 (没有 `crossorigin` 的 Markdown 图片) | `vite/cross-origin-media.ts` 在模板编译时给外站的 `<img>`、`<video>`、`<audio>` 加上 `crossorigin="anonymous"`；图片要来自发送 CORS 响应头的站点 |
| 首次访问时 htop 显示 1 个 CPU 和 494 MiB | 第一次 navigation 没有经过 service worker，所以页面不是 cross-origin isolated | Worker 进入 active 状态后，`isolate-page.js` 刷新首次访问的页面 |
| 用 `transformIndexHtml` 加入的 head 脚本在 dev 模式下缺失 | Slidev 的 dev server 用自己的 middleware 响应 `/index.html`，不经过 Vite 的 HTML transform (@slidev/cli@53.1.0 `dist/serve-*.mjs`)；仓库的 `.gitignore` 会忽略放在 deck 根目录的 `index.html`，`pnpm clean` 也会删除它 | Dev server 自己发送响应头；脚本只内联到构建产物里 |
| 早期版本注册的 service worker 留在 dev origin 上 (`localhost:3034`，scope 为 `/`) | 它比 deck 存活得更久，会给之后在这个端口上运行的任何其他站点加上 COOP 和 COEP | Dev 页面会 unregister `coi-sw.js` |
| Hard reload (Shift) 后以 1 个 CPU 运行 | Hard reload 会绕过 service worker；在 Chrome 157 里，紧随其后的页面自动刷新也没有获得 cross-origin isolation | 每个 tab session 只刷新一次，所以停在这里，不会循环刷新；普通刷新会重新获得 cross-origin isolation |
| 如果 pty 桥接把输出 stream transfer 到另一个线程，在 Safari 里会失败 | Safari 不能把 `ReadableStream` transfer 到另一个线程，unkernel.dev 自己的 service worker 里有这条说明 (`vm-sw.js`) | 输出以消息形式跨线程传递，每次 `pull` 一个 chunk |
| 使用 `COEP: credentialless` 时，app 启动比不做 cross-origin isolation 时晚约 0.85 s | Cross-origin 的 `no-cors` 请求不带 credentials，并使用单独的连接，所以阻塞渲染的 Google Fonts 样式表要新建一个连接 | 改用 `require-corp`，样式表本身发送 CORP，继续走共享连接 |


## 如何检查

- 在终端里，`nproc` 输出 `4`，htop 显示 CPU 0 到 3，内存约 470 MiB；1 个 CPU 时为 494 MiB
- 控制台里 `crossOriginIsolated` 为 `true`
- Dev: `curl -sI http://localhost:3034/` 能看到这两个响应头
- 构建产物: DevTools > Application > Service workers 里，deck 的 scope 下只有一个 worker，即 `coi-sw.js`；`(await navigator.serviceWorker.getRegistrations()).length` 为 1
- 要复现首次访问，需要一个从未打开过该 origin 的浏览器 profile。`playwright-cli` 的各个 session 共用同一个 Chrome profile，之前运行留下的 service worker 会保留下来，所以这类运行要用单独的 `--profile` 目录
