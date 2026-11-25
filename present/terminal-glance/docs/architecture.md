# 架构

这个 deck 在页面里运行一个真实的 Linux: unkernel 编译成 WebAssembly 的 kernel，加上 unkernel 的 Alpine aarch64 image 和一块预装工具的 disk。
Slide 上的每个终端都是这台机器上一个独立 pty 里的 shell，由 ghostty-web 绘制


## 分层

```
slides.md, pages/         内容、demo Step、speaker notes
   │
components/               Vue 视图；依赖 Slidev 的概念 (render context、当前 slide、layout)
   ShellDemo.vue          一个 demo：上下堆叠的终端 + 编号的 Step；向下提供终端名
   Terminal.vue           一个终端窗口；所在 slide 激活时接管其 session 的元素；高度拖拽手柄
   ShellStep.vue          一个 Step 按钮；在本窗口播放，或从 presenter 窗口转发；shell 高亮 (shell-highlight.ts)
   WebVideo.vue           外站的视频，带浏览器自带的控件和指向其页面的链接
   diagrams/              TTY、SSH、OSC 和 Agent 网关的 SVG 图；DiagramFrame.vue 为每张图提供共享的明暗样式
setup/main.ts             Slidev app setup：在观众窗口里开始 Linux 的下载
   │
runtime/                  纯 TypeScript；不含模板
   session.ts             ShellSession = 一个 pty + 一个 emulator；按 slide 和名字登记；Step 播放
   emulator.ts            终端模拟器的适配层 (ghostty-web)；mouse reporting
   queries.ts             回答 ghostty-web 不回答的颜色查询和 device-attribute 查询
   mouse.ts               纯函数：DEC mouse mode → 协议，指针动作 → report 字节
   bell.ts                哪些 BEL 字节会响铃 (一个读输出流的 parser)，以及铃声
   graphics.ts            纯函数：从输出流取出 iTerm2 / kitty 图片序列，读取图片 header 中的尺寸，计算 cell 布局
   graphics-overlay.ts    把这些图片画在 canvas 上方，锚定到各自的 buffer 行
   terminal-height.ts     拖拽后的终端高度，限制在允许范围内并保存在 localStorage
   appearance.ts          终端共享的明暗偏好和配色
   palette.ts             两个同步的 VT parser，按终端的明暗偏好选用
   program-status.ts      root OSC 7501 report 的 stream observer
   kernel.ts              页面唯一的 VM，每个 tab boot 一次：1 个 CPU 时在页面主线程上，4 个 CPU 时在 kernel-worker.ts 里
   kernel-worker.ts       Web Worker：在多个 CPU 上运行 kernel，并把它的 pty 提供给页面
   kernel-worker-host.ts  页面这一侧：启动 worker，响应它的文件读取，代理它的 pty (协议：kernel-worker-protocol.ts)
   image-source.ts        已发布 image 的文件，在页面主线程上获取：manifest、boot bundle、后台下载
   disk.ts                把已发布的 image (Alpine image 和 data disk) 包装成 disk，两个线程都能用：各自的 boot bundle 预先载入，chunk 按需读取；data disk 上面盖一层内存中的 copy-on-write 层
   steps.ts               纯函数：Step → 字节，`{a.pts}` 引用
   relay.ts               presenter 窗口 → slide 窗口 (BroadcastChannel)
   demo.ts                ShellDemo context 和终端的强调色
   isolate-page.js        内联在构建产物 index.html 顶部的纯 JS：注册 public/coi-sw.js，让首次访问刷新一次
   │
unkernel (npm)            createKernel, vm.spawn() → Pty, CowDisk, BaseDisk; unkernel.wasm = kernel + base initramfs
ghostty-web (npm)         WebAssembly 版的 Ghostty VT parser、canvas renderer、xterm.js 风格的 API
   │
public/coi-sw.js          service worker：给 deck 的文档和 worker 脚本加上 COOP/COEP (cross-origin isolation)
public/linux/             由 image/ 构建 (gitignored)：manifest.json、chunks/ + boot/ (data disk)、distro/ (Alpine image)
image/                    image 的构建：见 image.md
```

依赖只指向下层。`runtime/` 从不 import `components/`；`steps.ts` 和 `disk.ts` 承载值得测试的逻辑，I/O 通过参数传入 (`ChunkLoader`)


## 生命周期


### 每个 tab 一次的 boot

1. 下载在任何脚本运行之前就开始：构建产物的 `index.html` preload disk manifest、manifest 里列出的两个 boot bundle 和 kernel wasm (见 [performance.md](./performance.md#提前开始-linux-的下载))。
   App 一运行，`setup/main.ts` 就在观众窗口里调用 `prefetchLinux()`；它发出的 fetch 接管 preload 得到的响应，kernel 边下载边编译
2. Deck 打开约 3 s 后，Slidev 会 mount 所有 slide (用 `v-show` 隐藏)。第一个处于 live 状态的 `Terminal` 调用 `useLinux()`，所以 VM 在后台 boot，通常在演讲讲到 demo 之前就已完成
3. `useLinux()` (`kernel.ts`) 在下载尚未开始时启动下载，检查浏览器支持，然后等 `prefetchLinux()` 同时发起的两项下载就绪后调用 `createKernel({ kernel, distro, disks, memoryMiB: 512 })`：在页面主线程上调用，或者带上 `cpus` 在 `kernel-worker.ts` 里调用 ([CPU](#cpu))。
   这两项下载分别是边下载边编译的 kernel wasm，以及各个 image；image 的 boot bundle (guest 到第一个 prompt 为止读取的字节，每个 image 一个文件) 在 manifest 一到达就开始获取 (image.md)。
   Alpine image 是只读的 `BaseDisk(ChunkedDiskBase)`；data disk 是 `CowDisk(ChunkedDiskBase)`，写入留在内存里，所以刷新页面后是一台全新的机器。
   `prefetchLinux()` 不运行 kernel。即便如此，`setup/main.ts` 也只在 `Terminal.vue` 会 boot 的地方调用它 (非 print mode 下的 `play` route)：别的窗口会编译一个永远不会 boot 的 kernel
4. Base initramfs 的 `/init` 以只读方式挂载 Alpine image (label 为 `kwroot`，`/dev/wda`)，把 label 为 `kwdata` 的 disk (`/dev/wdb`) 挂载到 `/data`，再把 `/` 做成以 image 为底、`/data/distros/alpine/upper` 在上的 overlay (image.md)。
   busybox `init` 启动 `kwbox tty serve` (kwtty)，由它响应 `vm.spawn()`。`session.ts` 以 root 身份 spawn 每个 shell：不指定的话，unkernel 的 distro image 会以用户 `user` 运行 session

`useLinux()` 做了 memoize，并在 Vite HMR 之间保留 (`import.meta.hot.data`)：一个线程只能运行一个 kernel

Manifest 不存在时 (刚 checkout、还没运行 `pnpm build:image`)，页面 boot unkernel 的 base shell (busybox ash，没有 Alpine)，每个新终端都会打印一条黄色提示说明这一点。
Image 是用另一个 unkernel 版本构建的时候，也会打印同类提示


### CPU

页面是 cross-origin isolated 时，guest 运行在 4 个 CPU 上 (手机上 2 个)，其他情况下运行在 1 个 CPU 上: unkernel 的多个 CPU 共享一块内存，这需要 `SharedArrayBuffer`；一个 CPU 等待另一个时会阻塞所在的线程，页面主线程不允许阻塞

| 页面 | CPU | Kernel 运行在哪里 |
| --- | --- | --- |
| Cross-origin isolated: dev server，或 service worker 已激活的构建产物 | 4 个，手机上 2 个 | `kernel-worker.ts`，使用同样的 disk；文件仍在页面主线程上获取 |
| 非 cross-origin isolated: hard reload，或不支持 service worker 的浏览器 | 1 个 | 页面主线程 |

- Dev server 自己发送 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp` (`vite.config.ts`)。
  在 GitHub Pages 上由 `public/coi-sw.js` 添加这两个响应头；它由 `index.html` 顶部的 `runtime/isolate-page.js` 注册，该脚本会让首次访问刷新一次
- 在这个 policy 下，deck 不加载没有 CORP 或 CORS 的外站资源，也不嵌入外站的 iframe

细节、slides 内容的规则和途中遇到的问题见 [isolation.md](./isolation.md)；实测数据见 [performance.md](./performance.md#4-个-cpu)


### 每张 slide 一次的终端

- Session 以 `<slide number>/<terminal name>` 为 key (`sessionKey`)。Registry 在 HMR 之间保留
- Linux 就绪之前出现的终端显示 Linux 的 boot 阶段 (`LinuxBoot.vue`)，直到它的 shell 首次输出。
  阶段依次是 download kernel、download disk、boot Linux、start shell，每个阶段显示为等待、进行中或完成 (下载显示大小，boot 显示耗时)；界面上还有下载的进度条。
  `kernel.ts` 把各阶段记录在 `linuxBoot` 中；boot 阶段在第一个 pty spawn 时结束，因为 `vm.spawn` 会等待 guest 的 kwtty，而 `createKernel` 在进入 kernel 时就 resolve，早于 guest 的 init。
  Boot 界面使用系统的等宽字体，无需下载，并在 0.2 s 后淡入，所以立即启动的 shell 完全不会显示它。
  Boot 之后的下载 (guest 读取了后台下载尚未取到的 chunk) 改为显示在标题栏；后台下载本身不在任何地方显示。
  之后才显示的终端没有 boot 界面：它的 shell 在 spawn 后约 0.15 s 打印 prompt ([performance.md](./performance.md#shell-的启动))
- Slide 变为激活时，`Terminal.vue` 调用 `session.show(element)`: session 的 host 元素移入窗口，emulator 打开 (仅第一次) 并 fit，shell 被 spawn (仅第一次)。
  Spawn 的路径是带 `user: 'root'` 的 `vm.spawn()` → `kwtty` → root 的 login shell，即带 jovial 的 zsh；fast-syntax-highlighting 在第一个 prompt 之后立即加载
- Pty 输出 → `emulator.write()`；emulator 的输入及其对终端查询的回复 → `pty.write()`；emulator resize → `pty.resize()` (SIGWINCH)
- 离开 slide 时终端失去焦点，shell 继续运行；回来时仍是同一个 shell
- 退出的 shell (`exit`，或在 prompt 处按 `^D`) 会在同一窗口里被新 shell 替换，并附一行暗色提示。如果整台机器停止 (`poweroff`)，终端会提示刷新页面


### Steps

`ShellStep` → `playStep(page, to, step)` (`session.ts`)：等待文本引用的终端运行起来，解析 `{a.pts}` / `{a.pid}`，然后按 `typingPlan` (`steps.ts`) 计算的时间表向目标 pty 输入。
按键立即发送，下一次输入前最多停顿 40 ms；文本每个字符最多 6 ms；文本里的换行作为 Enter 发送，Enter 最后发送。
输入时间表最长 600 ms，文本越长，输入越快。落在同一个写入间隔内的字符合并成一次写入；间隔为 16 ms，长文本的间隔更长，所以一段输入最多约 24 次写入。
zsh 每次读取都会重绘整行 (带语法高亮)，所以写入次数决定 echo 何时结束；在页面中实测，最长的 Step (90 到 270 个字符) 在点击后 540 到 660 ms 完成输入和 echo，包括 Enter。
同一个终端上的 Step 依次排队；shell 执行命令的时间不计入这个输入预算

在 presenter 窗口里，按钮通过 `BroadcastChannel` 发送 `{ page, to, step }`；运行 Linux 的 slide 窗口负责播放

按钮里的 Step 文本由 shiki 按 shell 语法高亮 (`components/shell-highlight.ts`)：使用 `shellscript` grammar、deck 的 vitesse 明暗主题和 shiki 的 JavaScript regex engine，第一次用到时才创建，在此之前文本不带高亮。
在构建产物里，它们属于 `app` chunk，约占其中 66 KB (gzip)


## 最大化的终端

终端标题栏的最大化按钮把窗口铺满整张 slide，距 slide 边缘 20 px，下面垫一层变暗的 backdrop；这里没有用浏览器的全屏。
窗口变为 `position: fixed`；由于 Slidev 缩放后的 slide 容器带有 transform，fixed 定位相对这个容器计算，窗口因此保持 slide 的缩放比例。
屏幕重新 fit，shell 收到新尺寸 (SIGWINCH)；一个占位元素保留窗口原来的位置，slide 上其他终端的位置不变。
Esc 仍交给 shell；再次点击按钮、点击 backdrop 或离开 slide 都会还原窗口。只有 live 的 `slide` render context 显示这个按钮


## Linux 运行在哪里

只有非 print mode 下 Slidev 的 `slide` render context 运行 Linux。Presenter、它的下一张 slide 预览、overview 和导出都渲染一个占位框，所以 presenter 窗口不会 boot 第二台机器


## 终端模拟器

`emulator.ts` 在 ghostty-web 0.4.0 之上暴露 `ShellSession` 需要的小接口 (`open`、`write`、`onData`、`onResize`、`fit`、`focus`、`blur`、`cols`、`rows`、`cellHeight`)。Deck 依赖的行为如下：

| 行为 | 由谁提供 |
| --- | --- |
| 松开鼠标拖拽即复制选区；双击复制一个单词 | ghostty-web，在没有程序请求 mouse report 时；否则需要按住 Shift |
| 给开启 mouse report 的程序 (开了 `mouse on` 的 tmux、htop、nvim、less) 发送 mouse report：按下、松开、拖动 (1002)、任意移动 (1003)、滚轮作为按钮 64/65、Shift/Alt/Ctrl 位、X10 (9) 按下；SGR (1006) 或默认编码 | `emulator.ts` (`#reportMouse`) 加上 `mouse.ts` 中的 encoder；ghostty-web 0.4.0 会跟踪这些 mode，但从不发送 report，见下文 |
| 文本中的 URL 在 hover 时显示下划线；Cmd-click / Ctrl-click 在新 tab 打开 (普通点击不打开，与 Ghostty 一致)。OSC 8 hyperlink 无法打开: ghostty-web 0.4.0 的 `getHyperlinkUri()` 总是返回 null | ghostty-web |
| Option(Alt)-click 把 shell 的光标移到点击的 cell (沿折行发送方向键，DECCKM 下为 `ESC O`)，限于 normal screen 且位于 scrollback 底部时 | `emulator.ts` 加上 `mouse.ts` 中的 `cursorMoveKeys` |
| 竖线光标 | `emulator.ts` 中的 `cursorStyle: 'bar'` |
| 网格铺满窗口宽度，ghostty-web 画在 canvas 右边缘的 scrollbar 贴着窗口边缘 | `emulator.ts` 按整 cell 铺满全宽 (ghostty-web 的 FitAddon 原本会留出 15 px 给 scrollbar，而这个 scrollbar 本来就画在 canvas 里面) 并让 canvas 右对齐；不足一个 cell 的余量留给左边距 |
| 程序请求时 (`CSI ? 2004 h`)，用户的粘贴内容会包在 bracketed-paste marker 中，zle 因此把多行粘贴当作一次编辑，不会逐行执行 | `emulator.ts`；ghostty-web 0.4.0 自己的粘贴不发送 marker |
| Cursor position report (`ESC [ 6 n`) | ghostty-web |
| 背景色 / 前景色查询 (OSC 10/11) 和 primary device attributes (`ESC [ c`) | `queries.ts` 中的 `QueryResponder`，由 `emulator.ts` 使用；jovial 在 zsh 启动时会查询这两项，没有回复就要等到超时 |
| Hack Nerd Font Mono，行高 1 | `Terminal.vue` 中声明的本地 WOFF2 font face，在 renderer 测量字体之前加载；`emulator.ts` 替换了 `CanvasRenderer.measureFont()`，让行高等于一个字号，并取整到屏幕上的整数 CSS 像素 |
| 在 Slidev 的 `transform: scale()` 里，链接的 hit-testing 正确、文字清晰 | `emulator.ts` 在 host 上抵消 slide 的缩放，按整像素的 cell 宽度 fit，并把 canvas 原点对齐到设备像素；窗口 resize 150 ms 后重新 fit，过渡动画结束后重新对齐 |
| Canvas 分辨率跟随显示器变化和浏览器缩放 | `emulator.ts` 监听 resolution media query，更新 renderer 的 device-pixel ratio 并重新 fit；ghostty-web 在下一次 render 时调整 backing store 的大小 |
| Inline images: iTerm2 `OSC 1337 ; File=` 和 kitty graphics protocol (`APC G`) | `graphics.ts` 在 ghostty-web 解析之前从输出中取出这些序列；`graphics-overlay.ts` 负责绘制，见下文 |
| 在终端里按键不会翻页 | `emulator.ts` 在终端的 host 上阻止 `keydown` 冒泡；Slidev 不把 ghostty-web 的 contenteditable 输入算作打字 |

终端字体从 18 个 slide 像素起算，并随 slide 缩放调整，让字符宽度是屏幕上的整数 CSS 像素。反向缩放让指针坐标和 renderer 的 cell 处在同一个坐标空间。
最后一步缩放修正限制 CSS transform 取整带来的残余缩放，再用一个偏移把 canvas 原点放到整数设备像素上。
Canvas 使用 `image-rendering: pixelated`，让 compositor 在 Slidev 的 transform 链中保留已经抗锯齿的设备像素

Hack 的 ascent 与 descent 之和超过一个 em。自定义的 baseline 让 box-drawing 字符的笔画在行高 1 时保持连续；字母的 descender 可能伸进下一行约一个像素。
字体文件、上游版本和 metrics 记录在 [字体的 README](../public/fonts/hack-nerd-font-mono/README.md)

Renderer 的这些适配依赖 ghostty-web **0.4.0**: [`dist/index.d.ts`](../node_modules/ghostty-web/dist/index.d.ts) 声明了 `CanvasRenderer` 及其私有的 DPR 字段；[`dist/ghostty-web.js`](../node_modules/ghostty-web/dist/ghostty-web.js) 实现了 `measureFont`、`renderLine`、canvas resize 和 DPR 的使用。
升级这个包时，重新检查这些方法以及上面的查询和键盘行为


### Mouse reporting

ghostty-web 0.4.0 会解析 mouse-tracking mode (`Terminal.getMode()`、`hasMouseTracking()`)，但没有任何代码把 mouse report 写给程序。
在 canvas 上按下鼠标会开始它自己的选区 (`SelectionManager.attachEventListeners`)，滚轮滚动它的 scrollback，在 alternate screen 上则发送 ↑ / ↓ (`Terminal.handleWheel`)；两者都在 [`dist/ghostty-web.js`](../node_modules/ghostty-web/dist/ghostty-web.js) 中

程序设置了 tracking mode 时，`emulator.ts` 抢先拿到指针事件: host 上的 capture listener 拦下 ghostty-web 的选区、单词复制和右键菜单，`attachCustomWheelEventHandler` 替换它的滚轮处理。
`mouse.ts` 按 [XTerm Control Sequences, "Mouse Tracking"](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Mouse-Tracking) 的定义编码每个动作；report 像键入的输入一样写入 pty。
Cell 由 canvas 在屏幕上的矩形除以网格得出，因此与 slide 的缩放无关。拖拽移出终端后，仍按边缘的 cell 持续 report，直到松开按钮。
滚轮的像素 delta 每 33 px 产生一次 report，每个事件最多五次，与 ghostty-web 自己在 alternate screen 上的滚动一致

按住 Shift 时保留 ghostty-web 的本地选区和滚动，和其他终端一样。默认编码只能表示到 223 的 cell (每个坐标一个字节)；超出后只有 SGR 能 report。
UTF-8 (1005) 和 urxvt (1015) 编码没有实现: tmux、ncurses 程序和 nvim 都会选 SGR


### Inline images

ghostty-web 0.4.0 解析 OSC 1337 和 APC 字符串后直接丢弃；它的 canvas renderer 只画 cell。所以每次写入都经过 `GraphicsOverlay.write()`：

1. `GraphicsStream` (`graphics.ts`) 把输出拆成文本和图片命令，可以跨任意 chunk 边界。文本 (包括其他所有 escape sequence) 原样到达 ghostty-web。
   末尾可能还会变成图片序列的部分会保留到下一个 chunk；这些字节 VT parser 本来也无法提前处理
2. 图片放在光标处。它占多少 cell 由请求 (`width` / `height`，kitty 的 `c` / `r`) 和从文件头读出的像素尺寸 (PNG、JPEG、GIF、WebP) 决定：未指定尺寸时一个图片像素对应一个设备像素，并缩小到能放进光标右侧、最后一行之上的区域。
   随后 overlay 向 ghostty-web 写入换行和 `CSI n C`，让光标停在图片最后一行的右侧，符合 kitty 的规定；这些行由文本网格自身预留
3. 图片是 canvas 上方一层里的元素，按 renderer 的 cell metrics 定位，并跟随 canvas 的设备像素对齐。它锚定在自己的 buffer 行 (放置时的 scrollback 长度 + 光标行)，因此随输出和滚轮一起滚动。
   覆盖它的擦除 (`CSI J`、`CSI 2 J`、`CSI 3 J`、`ESC c`) 会移除它；放在 alternate screen 上的图片在程序离开 alternate screen 时消失

支持: iTerm2 的 `File=`，带 `inline=1`、以 cell、`px`、`%` 或 `auto` 为单位的 `width` / `height`、`preserveAspectRatio`，格式为浏览器能解码的任意格式；kitty 直接传输的 PNG (`f=100`) 和原始 RGB / RGBA (`f=24` / `f=32`)，用 `m` 分块，动作 `T`、`t` + `p` (按 image id)、`d` (全部，或按 id) 和 `q`，参数 `c`、`r`、`C` 和 `q`。
回复 (`ESC _ G i=<id>;OK ESC \`) 只发给带 id 的命令，与 kitty 一致

不支持: kitty 压缩 (`o=z`)、文件和共享内存传输、source rectangle 和像素偏移、低于文本的 z-index、动画、Unicode placeholder；iTerm2 的 multipart 传输。
终端 resize 时图片不跟随文本 reflow，也不跟随 scroll region 内的滚动；scrollback 存满 5000 行之后，较早的图片会错位。
升级 ghostty-web 时重新检查这一层：如果新版本自己能画图片，这一层就多余了


### 终端高度

拖动终端窗口底边的手柄可以调整高度；宽度跟随 slide 的 layout。拖动范围最少约十行，最多到终端所在列剩余的空间 (同一列的其他终端保留各自拖过的高度，没拖过的按十行算)。
Emulator 通过窗口的 `ResizeObserver` 重新 fit，所以拖动过程中 shell 就会收到 SIGWINCH。双击手柄让终端回到 layout 的高度

`terminal-height.ts` 以 slide 像素保存高度，与窗口大小无关，存放在 `localStorage` 的 `terminal-glance:terminal-heights` 下，以 session key (`<slide number>/<terminal name>`) 为 key；presenter 窗口通过 storage event 同步。
在 demo 之前插入 slide 会让 slide 编号移动，此时保存的高度会作用到现在持有这个 key 的终端；放不下的已存高度会随列缩小，不会溢出


### 终端共享的外观

每个终端的标题栏切换的都是同一个明暗偏好，与 Slidev 的页面主题无关。
`appearance.ts` 把 `terminal-glance:appearance` 存在当前 origin 的 `localStorage` 中，storage 不可用时回退为暗色，并接受其他 tab 的修改。刷新后偏好保留；VM 和它的 disk 写入照常重置

ghostty-web 0.4.0 在写入 cell 时就在 WASM parser 内部把默认色和索引色解析成具体颜色。它的 `options.theme` setter 只会打印警告，`CanvasRenderer.setTheme()` 更新 renderer 的颜色，却不改已写入的 cell。
因此 `palette.ts` 给两个真实的 parser 喂相同的输出和 resize 事件，分别使用暗色和亮色配色。Emulator 选择当前的 parser，通过同一个 renderer 重绘；应用显式指定的 truecolor 仍由应用决定。
只有当前 parser 对终端查询的回复会到达 PTY，另一个 parser 的回复读出后丢弃

这样切换时 shell、屏幕和 alternate screen 的状态都不变，scrollback 有上限 (每个 parser 5,000 行)。VT 解析和 parser / scrollback 的存储大约翻倍；不会保留无上限的输出记录。
这个适配依赖 ghostty-web 0.4.0 的 `Ghostty.createTerminal`、`GhosttyTerminal` 的方法和 `CanvasRenderer.render`；出处是上文链接的声明文件和 bundle

OSC 10/11 的回复使用当前选中的配色。什么时候查询由应用决定: bat 每次运行时查询，jovial 在初始化时选定 prompt 配色。
在标题栏切换不会重启 shell，也不会向应用发送颜色变化通知


### Bell

终端输出中的 BEL (0x07) 会响铃：标题栏在终端名旁显示一个铃铛 2.6 s (新的 bell 会重新计时)，页面通过 WebAudio 播放一声短促的提示音。
`bell.ts` 用一个跨写入保持状态的小型 VT parser 判断哪些 BEL 字节会响铃：结束 OSC 字符串的 BEL (`ESC ] … BEL`，窗口标题和颜色回复都这样用)，以及位于 DCS / APC / PM / SOS 字符串内部的 BEL 不响。
ghostty-web 0.4.0 有 `onBell` 事件，但它的 `Terminal.write` 对写入中的任何 0x07 都会触发，包括 OSC 的终止符，所以 deck 不使用它

浏览器在页面收到用户手势之前保持静音，而 bell 会在触发它的点击之后过一段时间才来。
所以页面上第一次点击或按键时就创建 `AudioContext`；间隔小于 120 ms 的多个 bell 只发一声


### Program status reports

`program-status.ts` 观察输出流中的 OSC 7501，包括跨多次写入拆开的 frame 和 tmux passthrough 包装。它回答 probe，对有效的 report 更新 root 的 program-status 记录，在 `state=clear` 或终端 reset 时清除记录。
Child 记录会被忽略；这里只演示 root status，没有实现完整的分层协议。显示用的数据流照常到达 VT parser

`session.ts` 把最新的记录提供给标题栏，`Terminal.vue` 把它像印章一样叠在标题栏右侧：半透明背景，逆时针旋转 5°，在标题栏上居中，高度比标题栏略大，所以上下都会探出来。
文本每次变化都会重放一次短暂的果冻弹跳，`prefers-reduced-motion` 下也保留，因为这是变化的唯一提示。
它只是程序自己的 report，不作为存活或成功的检查。
Wire framing 遵循 [Program Status Protocol rev 0.4](https://www.superlogical.com/rex/docs/build/program-status) 和 [botmux cb8ff44b2 的 parser](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/utils/program-status-parser.ts#L14-L120)；observer 中的行内引用标明了哪些行为由此推导


## 加载与缓存

构建、下载、boot 和 HTTP cache 如何针对慢速网络安排，以及实测数据，见 [performance.md](./performance.md)


## 键盘与焦点

- Step 按钮被点击后会主动失去焦点: Slidev 的键盘导航在有按钮获得焦点时会关闭
- 终端有焦点时，所有按键都交给 shell。点击终端外部即可恢复 Slidev 的快捷键


## 约束

| 约束 | 影响 |
| --- | --- |
| unkernel 需要 WebAssembly JSPI | Chrome / Edge 137+、Firefox 153+、Safari 27+。其他浏览器会在终端里看到提示 |
| `unkernel` 固定在一个 prerelease 版本 (`0.2.0-261124-c08e977`) | 有计划地升级，按 [image.md](./image.md#升级-unkernel) 里的检查逐项进行；image 构建会获取该 release 的 Alpine image |
| 每个线程只能有一个 kernel | 不要在 `kernel.ts` 之外调用 `createKernel` |
| 多个 CPU 需要 cross-origin isolated 的页面和一个 worker | Dev server 自己发送响应头，构建产物由 `public/coi-sw.js` 添加；不加载没有 CORP 或 CORS 的外站资源，不嵌入外站 iframe ([CPU](#cpu)) |
| Guest 内存: 512 MiB (`kernel.ts`)，即演讲中 htop 那一步显示的值；分配不了时 unkernel 会尝试更小的值 | 对 deck 用到的工具足够；写入 disk 的数据也在内存里。unkernel 自己的默认值 (桌面端 2 GiB) 并不能 boot 得更快 |
| Guest 里没有网络 | `apk add` 和 `git clone` 在页面上会失败；需要的工具改为预装在 image 里 |
| `vite.config.ts` 把 `unkernel` 排除在依赖 pre-bundling 之外 | SDK 相对于自己的 module URL 查找 `unkernel.wasm` |
