# 性能

这个 deck 常在慢速或高延迟的网络下打开，单个请求可能卡住好几秒。其中最重的部分是 Linux: kernel wasm 的传输体积是 4.4 MB，两个 disk image (unkernel 的 Alpine，以及预装工具) 共 25.4 MB。这里的所有工作都围绕三个目标：

- 无论 Linux 处于什么状态，slide 都在几秒内渲染出来
- 网络一传完 kernel，Linux 就立刻到达第一个 prompt
- 演讲后面的操作 (一个 Step、`htop` 的首次运行) 都不等网络

本文列出构建、页面和 guest image 为这些目标各做了什么、各自的实测结果，以及仍然存在的开销。Disk 格式和 image 的构建见 [image.md](./image.md)，boot 和 Step 见 [architecture.md](./architecture.md)；下面各节会链接过去

传输体积以 MB (10^6 字节) 为单位，便于和以 Mbps 计的网速对比: 3 Mbps 即 375 KB/s。Disk 布局相关的数字 (1 MiB 的 chunk、16 KiB 的 block) 仍用二进制单位

本地测量用的是一个仿照 GitHub Pages 的本地 HTTP/2 server (带 gzip 和 ETag/304)，浏览器是 Playwright 驱动的 Chrome。CDP `Network.emulateNetworkConditions` 设置每个请求的延迟和带宽；它把带宽平均分给各个请求，不考虑 fetch priority。每次冷加载都用全新的 profile，每个变体跑 2 次。测量脚本不在仓库里

早期的测量曾被三件事带偏：

- Deck 按 hash 路由，只改 URL 的 hash 不会重新加载它：两次运行之间要显式刷新
- `page.goto` 在 `load` 事件时 resolve，而在快速的本地 server 上，这个事件晚于第一个 prompt；计时要从 navigation 开始，与页面里的 `performance.now()` 一致
- `playwright-cli` 的各个 session 共用同一个 Chrome profile，service worker 和 HTTP cache 也一并保留：测冷加载或首次访问时，要给它单独的 `--profile` 目录，或者通过 CDP 清空并禁用缓存


## 页面下载的内容

体积取自当前的构建产物。「传输」列是 gzip 后的体积，由本地 level-6 gzip 算出；对 unkernel 0.1.0 的 wasm，它与 GitHub Pages 实时 gzip 的结果相差不到 0.5 %

| 文件 | 传输 | 时机 |
| --- | ---: | --- |
| `index.html` | 0.7 KB | 最先 |
| `assets/index-*.js`: Slidev、Vue、shiki 和所有 slide (`app` chunk) | 341 KB | 第一张 slide 渲染之前 |
| `assets/terminal-*.js`: ghostty-web (内联了它的 wasm) 和 unkernel 的 loader | 386 KB | 第一张 slide 渲染之前 |
| `assets/style-*.css` | 35 KB | 第一张 slide 渲染之前 |
| `assets/unkernel-*.wasm`: kernel 及其 base initramfs | 4.4 MB | 一开始就下载，低优先级 |
| `linux/manifest.json` 和两个 boot bundle (data disk、Alpine image) | 1.8 MB | 一开始就下载，低优先级 |
| Hack Nerd Font Mono 的 regular 和 bold | 2 × 1.25 MB | 第一个终端绘制之前 |
| `linux/distro/chunks/*.gz` 和 `linux/chunks/*.gz`: 两个 image，gzip 前分别是 4 个和 87 个 1 MiB 的 chunk | 25.4 MB | 第一个 prompt 之后，在后台下载 |

Kernel wasm 和两个 boot bundle 共 6.3 MB，它们决定 Linux 最早什么时候能 boot: 3 Mbps 下要 17 s，25 Mbps 下要 2.0 s

GitHub Pages 会实时 gzip 这个 wasm: unkernel 0.2.0 的 `unkernel.wasm` 原始大小 11,440,861 bytes，gzip 后 4,419,116 bytes。它只带未压缩的 base initramfs；Alpine 是单独的 image。GitHub 从不发送 brotli；在 unkernel 0.1.0 的 wasm 上，预先用 zopfli 压缩、由浏览器自己用 `DecompressionStream('gzip')` 解码的文件只省了 2.7 %，所以这个文件按 unkernel 发布时的原样提供


## 构建页面

| 设置 | 位置 | 效果 |
| --- | --- | --- |
| `build.rolldownOptions.output.codeSplitting` | `vite.config.ts` | 页面只有两个脚本，外加 rolldown 0.7 KB 的 runtime: `terminal` (ghostty-web 及其内联的 wasm，加上 unkernel 的 loader) 和 `app` (Slidev、Vue、shiki 和所有 slide)。切换 slide 不再加载脚本。它取代了 Slidev 自带的 `manualChunks` |
| `build.cssCodeSplit: false` | `vite.config.ts` | 只有一个样式表，不再每张 slide 一个；slide 的样式都是 scoped 的，一次全部加载也安全 |
| `preloadImages: false` | `slides.md` headmatter | Slide 的图片随各自的 slide 加载 (Slidev 在打开约 3 s 后 mount 这些 slide)，不和脚本抢带宽 |
| 只带一种 grammar 的 Shiki core | `components/shell-highlight.ts` | Step 按钮的 highlighter 只带 shell grammar、两个 vitesse theme 和 JavaScript regex engine，不带 oniguruma 的 wasm 和其他 grammar: 在 `app` chunk 里约占 66 KB gzip |
| 视频在首次显示时才加载 | `components/WebVideo.vue` | botmux 的演示视频 (4.4 MB) 在它所在的 slide 第一次显示时才加载，并且只在观众窗口和 presenter 窗口里加载 |

本地实测，延迟 400 ms、带宽 3 Mbps。「之前」是 `7d99b43`，用的是 Slidev 默认的 chunk 划分

| 指标 | 之前 | 之后 |
| --- | ---: | ---: |
| 渲染 slide 5 所需的脚本和样式表 | 28 | 4 |
| Slide 5 冷加载：渲染完成 | 5.02 s | 2.86 s |
| Slide 1 冷加载：渲染完成 | 4.02 s | 2.78 s |
| Slide 5 冷加载，到标题显示 `/dev/pts/0` 之后 1.5 s 为止的请求数 | 139 | 43 |
| 缓存过期后刷新: conditional request 数 | 147 | 51 |
| 缓存过期后刷新: slide 5 渲染完成 | 2.20 s | 0.96 s |

当时还没有 boot bundle (它是后来加的)，43 个请求里大部分是 disk chunk

终端模拟器是 ghostty-web 0.4.0，在 `terminal` chunk 里占 185 KB gzip。最小的可用替代品 xterm.js 6 能省 92 KB (3 Mbps 下 0.24 s)，代价是失去 Ghostty 的 parser、原生 kitty 图片和 1 em 的行高 (xterm.js 的行约高 16 %)。单是 kernel wasm 就有 ghostty-web 的 24 倍大


## 提前开始 Linux 的下载

| 机制 | 位置 | 效果 |
| --- | --- | --- |
| `preloadLinux()` | `vite.config.ts` | `index.html` 会 preload `linux/manifest.json`、两个 boot bundle 和 `unkernel.wasm` (`as="fetch"`、`crossorigin`、`fetchpriority="low"`)，让它们在任何脚本运行之前就开始下载 |
| 在 app setup 里调用 `prefetchLinux()` | `setup/main.ts` | 在观众窗口里，app 一运行就接管这些下载，并开始编译 kernel。没有这次调用的话，在没有终端的 slide 上打开 deck，要等 Slidev 预先 mount 第一个终端时才开始下载，大约在 deck 渲染后 3 s。Dev 环境没有 preload，下载由这次调用发起 |
| 构建产物里的低 fetch priority | `runtime/downloads.ts` (`AHEAD_PRIORITY`) | Kernel、manifest 和 boot 数据用 `priority: 'low'` 的 fetch 下载，在 server 遵守优先级时排在 deck 的脚本和样式之后。Dev server 通过 HTTP/1.1 提供约 700 个 module，Chrome 会把低优先级请求压到这些 module 下载完之后，所以 dev 环境保留默认优先级 |
| 边下载边编译 | `runtime/kernel.ts` | `loadKernelModule` 在 wasm 流式下载的同时编译它 |

`kernel.ts` (取 wasm，把它的 `Response` 交给 unkernel 的 `loadKernelModule`) 和 `disk.ts` (取 manifest 和 bundle) 里的 `fetch()` 调用会接管 preload 的响应。`as="fetch"` 和 `crossorigin` 与普通的 `fetch()` 匹配；换成别的 `as`，或者不带 `crossorigin`，每个文件都会再发一次请求，最好的情况也只是从 HTTP cache 返回

每个窗口都会 preload，presenter 窗口也不例外，但只有观众窗口会编译并 boot。某个文件还在下载时，Chrome 会让第二个窗口对它的请求复用这次下载，所以同时打开的观众窗口和 presenter 窗口每个文件只下载一次。单独打开的 presenter、overview 或 notes 窗口会下载用不上的 6.3 MB，并输出 “preloaded but not used” 警告；这些警告无害

除非某行另有说明，均为本地实测，延迟 400 ms、带宽 3 Mbps。「之前」是 `cf170ab`；「之后」加上了 preload 和 app setup 里的调用，当时还没有低优先级。场景：打开 slide 1，第 10 s 切到 slide 5

| 指标 | 之前 | 之后 |
| --- | ---: | ---: |
| Kernel wasm 请求开始 | 5.75 s | 0.41 s |
| 切到 slide 5 → 第一个 prompt | 27.0 s | 23.5 s |
| 同上，延迟 2000 ms | 31.8 s | 26.6 s |
| 第一张 slide 渲染完成 | 2.8 s | 4.6 s |
| 同上，延迟 2000 ms | 6.4 s | 7.8 s |
| Slide 5 热缓存刷新 (单独一次运行) → 第一个 prompt | 1.6 s | 1.0 s |

第一张 slide 渲染变晚，是因为模拟的网络把带宽平均分给各个请求，wasm 拖慢了脚本；见 [剩余开销](#剩余开销)


## 从 boot 到第一个 prompt

### Boot bundle

构建时，`image/vm/trace-boot.ts` 离线 boot 两个 image，记录 guest 从每个 image 读了什么，一直记到 zsh 的第一个 prompt 和插件加载完成；这两个时间点由 `.zshrc` 用 `OSC 1337 SetUserVar` escape sequence 标记。
Boot 从 data disk 读了 243 个 16 KiB 的 block (3.8 MiB)，它们打成一个 0.95 MB 的 gzip 文件，而它们所在的 21 个 chunk 共 3.0 MB。从 Alpine image 读的是前 58 个 block，打成一个 0.89 MB 的文件。
页面和 kernel 一起下载这两个文件，所以 guest boot 时从内存读取，不用每个 chunk 等一次 round trip ([image.md](./image.md#发布格式))

本地实测，延迟 400 ms、带宽 3 Mbps，slide 5 冷加载。「之前」是 `7d99b43`；这个基线也还没有合并脚本，所以时间从 manifest 请求开始算

| 指标 | 之前 | 之后 |
| --- | ---: | ---: |
| Manifest 请求 → 第一个 prompt | 59.4 s | 31.8 s |
| Prompt 之前的 disk 请求 | 37 个 chunk，10.2 MB | 1 个 bundle，1.1 MB |

Kernel wasm 下载完约 0.3 s 后 prompt 就出现了 ([unkernel 0.2.0](#unkernel-020))，所以 boot 只在等 wasm

两条规则保证 boot 失败或耗时较长时不会多下载：
- Bundle 下载失败时，boot 用到的 chunk 每次并发取 6 个
- 每个取到的文件都按发布时的原样保留 (`runtime/disk.ts` 里的 `ImageFiles`)，所以没有文件会下载两次；预取的 chunk 在 guest 读到之前也一直保持解压状态

`test/disk.test.ts` 用 property test 覆盖了这两条


### unkernel 0.2.0

unkernel 0.2.0 把 riscv64 CPU 换成了 aarch64，并拆分了 guest: `unkernel.wasm` 包含 kernel 和一个 base initramfs，每个 distro 是 release 里单独的 erofs image。Deck 把 Alpine image 也发布成 chunk，并带有它自己的 boot bundle ([image.md](./image.md#image-的组成))，所以 boot 时要下载 kernel 和两个 bundle

本地用 Chrome 157 实测，slide 5 冷加载，延迟 400 ms、带宽 3 Mbps，每组跑 2 次。0.1.0 一列是 unkernel 0.1.0-261117-0e4b2ec 上的 `17348f7`，0.2.0 一列是同一个 deck 换成 0.2.0-261124-c08e977；每组内各次运行相差不到 20 ms

| 指标 | 0.1.0 | 0.2.0 |
| --- | ---: | ---: |
| 第一个 prompt 之前的 Linux 下载 | 3 个请求，8.19 MB | 4 个请求，6.26 MB |
| Kernel wasm 传输体积 | 7.21 MB | 4.42 MB |
| Navigation → 第一个 prompt | 33.2 s | 28.2 s |
| Kernel 下载完成 → 第一个 prompt | 0.32 到 0.34 s | 0.30 到 0.31 s |

不 throttle 时 (每组 3 次)，下载在 navigation 后 40 ms 内结束，到 prompt 的时间就是页面自身的启动加上 boot 的耗时：

| 指标 | 0.1.0 | 0.2.0 |
| --- | ---: | ---: |
| Kernel 编译 (边下载边编译，来自 preload) | 23 到 26 ms | 23 到 24 ms |
| 编译完成 → shell 的第一次输出 (boot、kwtty、spawn) | 229 到 232 ms | 208 到 214 ms |
| Shell 的第一次输出 → prompt (9 次) | 85 到 110 ms | 79 到 89 ms |
| Prompt 之前编译的 JIT module | 141 到 168 个，6 到 8 ms | 62 到 68 个，3 到 4 ms |
| 第一个按键 → 它的 echo (11 次) | 13 到 25 ms | 13 到 26 ms |

Kernel 编译要等 Slidev 的 app 运行之后才开始，两个版本都在 navigation 后 0.54 到 1.03 s；到第一个 prompt 的时间差异就出在这里，各跑 17 次，0.1.0 为 0.85 到 1.37 s，0.2.0 为 0.81 到 2.07 s

Guest 的内存是 512 MiB (`kernel.ts`)，与 0.1.0 的默认值相同。unkernel 0.2.0 在桌面端的默认值是 2 GiB，boot 并不更快：在 Node 上，512 MiB 时 prompt 在 `createKernel` 后 272 到 274 ms 出现，2 GiB 时为 279 到 287 ms


### 4 个 CPU

Guest 在一个 cross-origin isolated 页面的 worker 里以 4 个 CPU 运行 ([isolation.md](./isolation.md))。线上站点由 Cloudflare Pages 发送所需的两个响应头，首次访问也直接以 4 个 CPU boot

本地用 Chrome 157 在构建产物上实测。每次运行都用新的浏览器 session，并清空、禁用 HTTP cache；测 1 个 CPU 时注销 service worker，测 4 个 CPU 时注册。每组 3 次，带 throttle 的两行各 2 次：

| 指标 | 1 个 CPU | 4 个 CPU |
| --- | ---: | ---: |
| App 请求 kernel → 第一个 prompt | 315 到 353 ms | 582 到 589 ms |
| 其中给 kernel 打 SMP patch | | 88 到 91 ms |
| Slide 18 和 21 (两个终端)：切换 slide → 两个 prompt 都出现 | 276 到 377 ms | 128 到 162 ms |
| 第一个按键 → 它的 echo | 14 到 26 ms | 9 到 20 ms |
| 延迟 400 ms、3 Mbps、冷加载: navigation → 第一个 prompt | 28.2 s | 27.7 到 27.9 s |
| 同上: kernel 下载完成 → 第一个 prompt | 0.28 到 0.29 s | 0.41 到 0.42 s |

首次访问时 (全新的浏览器 profile，还没有 service worker)，页面在 worker 激活后刷新一次，然后以 4 个 CPU boot。不 throttle 时，prompt 在 navigation 后 1.17 s 出现；延迟 400 ms、3 Mbps 时为 28.5 s (各 1 次)；作为对比，以 1 个 CPU 运行、不刷新的首次访问为 28.2 s

在 Node 上用同样的 image，4 个 CPU 同时跑四个 `seq 200000 | sort -r` 用时 2.7 s，1 个 CPU 要 9.3 到 9.4 s；单独跑一个用时 2.0 s，1 个 CPU 要 2.2 s

所以 4 个 CPU 的 boot 晚约 0.25 s，其中一半是 SMP patch；在有两个终端的 slide 上，shell 的启动时间减半；单个程序的速度与 1 个 CPU 相同


### Shell 的启动

Image 加载两个 zsh 插件: jovial theme，以及在第一个 prompt 之后立刻加载的 fast-syntax-highlighting。node、python3 和 zoxide 不装进 image，如果它们作为依赖重新出现，构建就会失败；去掉它们后，发布的 image 为 22.7 MiB gzip，原来是 58.5 MiB (`ce872b1` 时)

在 VM 里，一条 zsh 语句约 30 µs，一次 fork 不到 1 ms，所以 shell 启动的耗时取决于它的脚本执行了多少。
对 login shell 做 trace，发现大部分时间花在 zinit 上：即使编译过，source 它也要 121 到 138 ms；插件加载期间，它给每个 `autoload`、`zle -N` 和 hook 套上的 wrapper 把 fast-syntax-highlighting 的加载拉长到 0.3 到 0.6 s，这段时间里输入的按键不会 echo；`compinit` 还要再花 50 ms。
现在 `.zshrc` 按 jovial 的 README 里不用插件管理器的安装方式，直接 source jovial，不启用补全系统，并在一个 `zle -F` handler 里加载 fast-syntax-highlighting，zle 一画出第一个 prompt 就运行这个 handler；在加载之前或加载期间输入的文字，会在加载结束后高亮 (细分耗时见 [image.md](./image.md#shell-启动耗时))

在 dev server 上实测，从 slide 变为 active 开始计时；「插件加载完成」指输入的按键能立即 echo 的时刻：

| 指标 | 之前 | 之后 |
| --- | ---: | ---: |
| 一个终端 (slide 14、31): prompt | 880 ms | 160 到 172 ms |
| 一个终端：插件加载完成 | 867 ms | 258 到 273 ms |
| 两个终端 (slide 18、21、25、28): prompt | 1290 到 1380 ms | 294 到 335 ms |
| 两个终端：插件加载完成 | 1890 到 1970 ms | 500 到 540 ms |

两个终端的 shell 同时启动；只有 1 个 CPU 时，它们共用这个 CPU ([4 个 CPU](#4-个-cpu))。Prompt 出现之前，每个 shell 在 jovial 的第一次 precmd 里花 77 到 82 ms，大部分用于计算 segment 长度，以及在新进程里启动 dev-env probe

Image 在 `~/.config/fsh` 里自带 fast-syntax-highlighting 的 secondary theme。没有这个文件时，插件每次启动都会尝试下载它，没有网络时输入的按键会被卡住 5 s。第一个输入的按键在 19 到 23 ms 后 echo；没有这个文件时要 5051 ms ([image.md](./image.md#shell-启动耗时))


### Boot 界面

在 Linux 起来之前显示的终端，会一直显示 boot 的各个阶段，直到它的 shell 第一次输出：
- download kernel 和 download disk，带下载的字节数；
- boot Linux，带耗时；
- start shell

这个界面用系统自带的等宽字体。终端字体设为 `font-display: block`，用它显示的文字在 1.25 MB 的字体文件到达之前都不可见

Linux 起来之后才显示的终端没有 boot 界面：它的 prompt 在 slide 打开后 0.16 到 0.34 s 出现 ([Shell 的启动](#shell-的启动))


## 第一个 prompt 之后

### 后台下载整个 disk

Shell 第一次输出 (即它的第一个 prompt) 或 kernel 开始运行后 5 s，以先到者为准，再等页面空闲，所有还没取的 chunk 就按 disk 顺序下载。在构建产物里，这个下载以低优先级进行，每次 2 个，不计入终端的进度条。取到的文件按发布时的原样 (gzip) 保留，两个 image 共 25.4 MB；读取时才解压对应的 chunk。Alpine image 的 4 个 chunk 最先下载。之后程序第一次运行就从内存读取

后台下载还没取到某个 chunk 时，guest 一读它，就会以普通优先级立即取这个 chunk 和后面两个 chunk。后台下载正在取的 chunk 不会再次请求；读取会等这次下载完成

本地实测，延迟 200 ms、带宽 1.5 MB/s (12 Mbps)，slide 5 冷加载：

| 指标 | 之前 | 之后 |
| --- | ---: | ---: |
| 第一个 prompt | 13.7 s | 13.95 s |
| 整个 disk 下载完成 | 不会下载完；每个 chunk 在第一次读时才下载 | 38.7 s |
| 下载完成后 `htop` 首次运行：请求数 | 每读一个 chunk 一个请求 | 0 |


### Steps

开启 syntax highlighting 的 zsh 每次 read 都会重绘整行，所以写入次数决定 echo 何时结束。一个 Step 在 600 ms 的排程内输入它的文本，最多约 24 次写入；最长的 Step (90 到 270 个字符) 连同 Enter 在点击后 540 到 660 ms 输入并 echo 完 ([architecture.md](./architecture.md#steps))

终端模拟器同步解析每次写入，pty 的输出一次写一个 chunk 进去，上一个解析完才写下一个。因此 `yes` 这样的大量输出由 pty 的 flow control 控制节奏，不会堆积在页面里


## 缓存与托管

脚本、样式表和 wasm 的文件名带 content hash，disk chunk 和 boot bundle 按内容命名。`index.html` 和 `linux/manifest.json` 保持固定的文件名，这样浏览器能取到新的部署。GitHub Pages 给每个文件都带 `cache-control: max-age=600`: 10 分钟内刷新不会为它们发请求，之后的刷新对每个文件发一次 conditional request 重新验证

站点直接由 GitHub Pages 提供: Cloudflare 对 `slides.zthxxx.me` 只做 DNS 解析 (DNS only)，HTTPS 证书由 GitHub Pages 提供。经 Cloudflare 代理时，作者的网络要绕道 Los Angeles 访问，请求会卡住好几秒，deck 在 180 s 内都没有渲染出来


## 构建 image

构建 image 的大部分时间花在 apk 下载软件包上。`image/build.ts` 会同时从官方 CDN 和四个 mirror (Aliyun、TUNA、USTC、SJTU) 下载 guest 的 package index (`v3.24/main/aarch64/APKINDEX.tar.gz`)，然后从最快的那个安装；设置 `ALPINE_MIRROR=<url>` 可跳过这次探测。
在作者的网络下，官方 CDN 只有约 30 KB/s，一次构建要 7 分钟以上。有了探测，unkernel 0.2.0 上 provision 耗时 30 到 40 s (0.1.0 上为 92 s，是同一网络、同一小时内的构建)，整个构建不到一分钟；某个 unkernel 版本的第一次构建还要下载它 4 MB 的 Alpine image。
apk 在选中的 mirror 上失败时，`setup.sh` 会改从官方仓库重新安装。运行超过 5 分钟 (`--timeout-min`) 的构建会报错退出 ([image.md](./image.md#构建))

Input hash 匹配时 `pnpm build:image` 直接跳过；manifest 缺少 trace 时只重跑 trace。CI 每次 push 都在没有缓存的情况下运行它，所以 CI 每次都是完整构建


## 线上站点

在线上站点实测，Chrome 缓存为空，slide 5。`7d99b43` 早于 chunk 设置、preload 和 boot bundle，当时的网速没有记录。`575af3b` 时，7.2 MB 的 kernel 约 3 s 内到达。`fc871bf` 时，用 curl 测得 wasm 的下载速度为 275 KB/s (2.2 Mbps)

| 指标 | `7d99b43` | `575af3b` | `fc871bf`, 2.2 Mbps |
| --- | ---: | ---: | ---: |
| Slide 渲染完成 | 2.3 s | 1.2 到 1.7 s | 8.4 到 12.5 s |
| 标题显示 `/dev/pts/0` | 8.8 s | 3.1 到 3.4 s | 未测 |
| 到 `/dev/pts/0` 为止的请求数 | 134 | 14 | 未测 |
| 第一个 prompt | 未测 | 未测 | 17 s 和 24 s；第三次运行 120 s 内没有出现 |
| 到第一个 prompt 为止的请求数 | 未测 | 未测 | 19 |

缓存已热时，`fc871bf` 在 0.08 到 0.24 s 内渲染出 slide，0.72 到 0.79 s 内画出第一个 prompt；`575af3b` 在 0.09 到 0.14 s 内渲染出 slide，0.3 s 内 spawn 出 shell


## 剩余开销

- **Kernel 的 preload 和脚本共用一条慢速网络。** 2.2 Mbps 下，页面 700 KB 的脚本和样式约需 2.5 s，但 slide 在 8.4 到 12.5 s 后才渲染出来。从时间上看，这条网络路径可能没有遵守 `fetchpriority="low"`，于是脚本和 wasm (当时 7.2 MB，现在 4.4 MB) 以及 boot bundle 共用带宽；具体原因没有单独查明。`index.html` 把 Google Fonts 的样式表放在 module script 之前，它也会阻塞 module script。去掉 wasm 的 preload 标签、保留 manifest 和 bundle 的 preload，可以让脚本优先下载；app 运行后 `setup/main.ts` 仍会发起 wasm 的下载
- **终端字体。** Hack Nerd Font Mono 的 regular 和 bold 文件各 1.25 MB，第一个终端要等两个都下载完
- **Fira Code** 通过一个会阻塞渲染的样式表从 Google Fonts 加载 (theme 的 `fonts.mono`)，第一张 slide 之前又多了一个要连接的 host
- **Slide 1 会加载 `terminal` chunk** (386 KB，3 Mbps 下 1.0 s)，因为各 slide 静态 import 了终端组件。改为动态 import `ghostty-web` 和 `unkernel/web`，就能把它移出 slide 1 的加载路径。unkernel 0.2.0 的 web entry 给这个 chunk 增加了 64 KB gzip，大部分是它 Web Worker 模式的脚本；这段脚本以内联方式带上，而 deck 并不使用
- **每次冷加载都要下载两个 image:** 第一个 prompt 之后共 25.4 MB，2.2 Mbps 下约 92 s；它们在整个 session 内保存在页面内存里，每个 image 最多保留 32 个解压后的 1 MiB chunk
- **Boot bundle 的内容会下载两次：** 后台下载还会取它们来源的 chunk，每次冷加载多 1.8 MB
- **Wasm 依赖 GitHub Pages 的 gzip，** 而 GitHub 没有为此写文档。不压缩的话会多 7.0 MB，3 Mbps 下约 19 s；改用 zopfli 压缩的 `.wasm.gz`，再用 `DecompressionStream('gzip')` 解码，就能去掉这个依赖
- **10 分钟后**，每个文件都要用一次 round trip 重新验证
- **4 个 CPU 让 boot 开始得更晚：** SMP kernel 要等下载结束、patch (约 90 ms) 打完后才编译
- **jovial 的第一次 precmd** 占每个 shell 启动的 77 到 82 ms: 35 到 42 ms 用于计算各 segment 的长度，每个 affix 跑一次 regex 循环 (`@jov.init-affix`)；15 到 18 ms 用于在 zpty 里启动 dev-env probe，每个 prompt 都会新起一个进程。在有两个终端的 slide 上，两个 shell 同时启动，1 个 CPU 时约 0.3 s 后显示 prompt，4 个 CPU 时为 0.13 到 0.16 s
