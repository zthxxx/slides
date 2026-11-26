# terminal-glance

“Terminal 概览 (其一)” 是一场关于终端、TTY、PTY、shell 和 ANSI 的分享，其中的 demo 运行在页面内的真实 Linux 上。
Demo 不需要服务器，也不需要联网：这个 Linux 是 unkernel (编译成 WebAssembly 的 Linux kernel)，配上一块预先构建、装好工具的 disk


## 常见任务

除非另有说明，以下命令都在仓库根目录运行

| 任务 | 命令 |
| --- | --- |
| 预览 deck | `pnpm dev terminal-glance` |
| 构建 guest image (首次 checkout，或修改 `image/` 之后) | `pnpm -C present/terminal-glance build:image` |
| 无论输入是否变化，都重新构建 image | `pnpm -C present/terminal-glance build:image --force` |
| 运行测试 | `pnpm -C present/terminal-glance test` |
| 重新渲染插图 (修改 `diagrams/` 之后，需要本机 Chrome) | `pnpm -C present/terminal-glance diagrams [<name>…]` |
| 构建整个站点 (guest image 的输入有变化时会先构建它) | `pnpm build` |

没有构建好的 image 时，页面仍能运行，用的是 unkernel 的 base shell (busybox ash，没有 Alpine)，并在每个终端里提示这一点


## 目录结构

```
present/terminal-glance/
  slides.md          deck 的入口：封面、pages/ 的顺序、结尾的 slide
  pages/             按主题分组的 slide，各自带 demo Step 和 speaker notes
  components/        ShellDemo、Terminal、ShellStep (由 Slidev 自动注册)
  diagrams/          插图的 archify 源文件 (<name>.<type>.json) 和渲染脚本 render.ts
  styles/            deck 级样式：插图的 .diagram
  runtime/           VM、session、终端模拟器、disk、Step、presenter 转发
  image/             guest image 的构建 (IaC)
  vite/              vite.config.ts 用到的模块：给外站的图片和视频加上 crossorigin
  test/              测试构建 ↔ runtime 之间的约定
  public/images/     slide 图片；diagrams/ 下是 render.ts 生成的插图 SVG
  public/linux/      构建出的 guest image (gitignored)
  .cache/            构建用的原始 disk (gitignored)
  docs/              本文档目录
```


## 文档索引

- [architecture.md](./architecture.md): 分层、boot 与 session 的生命周期、终端模拟器、约束
- [image.md](./image.md): guest image 是什么、如何构建和发布、shell 的启动耗时、体积、如何修改
- [performance.md](./performance.md): 构建、下载、boot 和 image 为慢速网络做了哪些处理，附实测数据和剩余开销
- [isolation.md](./isolation.md): cross-origin isolation 与 guest 的 4 个 CPU，包括浏览器为什么要求这两个响应头、它们的其他影响与限制、service worker、kernel 的 worker、slides 内容的规则、遇到的问题
- [authoring.md](./authoring.md): 用 `<ShellDemo>` 和 `<ShellStep>` 编写 demo slide、插图，以及 speaker notes


## 演讲时

- 打开 deck，再从 deck 打开 presenter view (同一浏览器)。在 presenter view 里点击的 Step 会输入到 slide 窗口的终端里
- Linux 跑在 4 个 CPU 上。在线上站点，首次访问会注册让页面 cross-origin isolated 的 service worker，然后自动刷新一次；hard reload (Shift) 会绕过这个 worker，以 1 个 CPU 运行 ([isolation.md](./isolation.md))
- 点进终端可以手动输入；用键盘翻页前，点一下终端外面
- 在终端里选中文字即复制。Cmd-click (Ctrl-click) 打开 URL。程序使用鼠标时 (tmux、htop)，点击和滚轮都交给程序；按住 Shift 可以选择文字
- 拖动终端底边可以调整高度，刷新后高度保留。双击底边恢复布局的默认高度
- 终端标题栏的最大化按钮让终端铺满整张 slide；再点一次按钮或点击背景即可还原
- 在 tmux 里 prefix 是 Ctrl-S (zthxxx/tmux-config)
