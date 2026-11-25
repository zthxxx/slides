# Guest image

Deck 里的 Linux 预装了 zsh (jovial 主题)、bash、tmux、htop、git、less、bat 和 neovim。
这些工具在构建 image 时安装，所以页面不需要网络，也不需要代理


## Image 的组成

Image 是一个 unkernel **data disk**，即 label 为 `kwdata` 的 ext4 文件系统，只保存叠加在 unkernel 自带 Alpine image 之上的内容

unkernel 0.2.0 把 kernel 和一个小的 base initramfs 一起发布 (`unkernel.wasm`: busybox 和 unkernel 的工具 `kwbox`)，并在 GitHub release 中把每个 distro 发布为单独的只读 erofs image。
Deck boot 的是 **Alpine 3.24 aarch64** (`alpine.erofs`, 3.9 MiB)，由 `image/vm/distro.ts` 从已安装版本对应的 release 下载，并用该 release 的 `distros.json` 校验；unkernel 的 Debian image 有 73 MB

Boot 时，页面把 Alpine image 挂接为 `/dev/wda` (`createKernel({ distro })`)，把这个 disk 挂接为 `/dev/wdb`。Base 的 `/init`:

1. 以只读方式挂载 label 为 `kwroot` 的 image，把 label 为 `kwdata` 的 disk 挂载到 `/data`；
2. 把 `/` 做成 overlay: lower 是 unkernel 的 kw layer 和 Alpine image，upper 是 `/data/distros/alpine/upper`；
3. Pivot 进这个 overlay，启动 busybox `init`；它的 inittab 运行 `kwbox tty serve` (kwtty)，也就是 `vm.spawn()` 背后的 server

所以 provision image 时安装的所有内容都位于 `/data/distros/alpine/upper`，并出现在 `/` 中。
出处: unkernel 仓库 `c08e977` 版本的 `guest/base/initramfs/init` 和 `guest/distro/alpine/rootfs/etc/inittab`

kwtty 从 `/etc/passwd` 读取 session 指定用户的 login shell 并运行 (`guest/src/kwtty.c`)。
unkernel 的 distro image 默认用户是 `user` (uid 1000)；页面以 root 身份 spawn 每个 shell (`runtime/session.ts`)，image 把 root 的 shell 设为 `/bin/zsh`

Upper 与构建它时所基于的 Alpine image 绑定: `/data/distros/alpine/lower` 记录了这个 image id (`/usr/lib/kw-image`, `alpine-3.24.4-7ab2d6761e667913`)。
每个 unkernel release 都发布自己的 image，也可能修改 base，所以 **`unkernel` 一变，image 就必须重新构建**。Manifest 里的 `unkernel` 与运行中的包版本不一致时，页面会在每个终端里给出警告


## 目录结构

```
image/
  build.ts            Bun。依次执行：计算 input hash、已是最新时跳过、获取 Alpine、provision、pack、trace boot
  pack.ts             Bun。Image 文件 → public/linux/ 下的 chunks/*.gz、boot bundle、manifest.json。导出 manifest 的类型
  vm/distro.ts        Node >= 24。已安装版本对应的 unkernel Alpine image (fetchDistro)，以 JSON 输出：path、size、sha256、id
  vm/provision.ts     Node >= 24。带网络和一个全新的 data disk 在 Alpine 上 boot unkernel，以 root 运行 guest/setup.sh，然后关机
  vm/trace-boot.ts    Node >= 24。像页面一样离线 boot 发布的 image；输出到第一个 prompt 为止从每个 image 读取的内容
  guest/              在构建用的 VM 内以只读方式挂载到 /provision
    setup.sh          在 guest 中运行 (busybox ash)：apk、login shell、zsh 插件、检查、清理、把空闲块清零
    packages.txt      apk 包，每行一个
    rootfs/           复制覆盖到 / ：shell 和 tmux 配置、demo 命令、/root/hello.sh 和 demo 图片
```

输出文件都已加入 gitignore：

| 路径 | 内容 |
| --- | --- |
| `.cache/image/kwdata.img` | 原始的 4 GiB sparse ext4 disk |
| `.cache/unkernel/v<version>/alpine.erofs` | unkernel 的 Alpine image，与 release 发布的文件相同 |
| `public/linux/manifest.json` | 已发布 image 的索引 (见下文) |
| `public/linux/chunks/*.gz` | Data disk 的数据 |
| `public/linux/boot/*.gz` | Data disk 的 boot bundle: guest 到第一个 prompt 为止从它读取的块，合在一个文件里 |
| `public/linux/distro/chunks/*.gz`, `distro/boot/*.gz` | Alpine image 的对应文件 |

Slidev 把 `public/` 复制进 deck 的构建产物，所以页面请求的是 `<base>/linux/manifest.json`

VM driver 运行在 Node 24 上，因为 unkernel 需要 WebAssembly JSPI，而 Bun 没有。`node` 的版本不低于 24 时，`build.ts` 直接用它，否则用 `npx -y node@24`


## 构建

```sh
cd present/terminal-glance
pnpm build:image            # skips when public/linux/manifest.json has the same input hash
pnpm build:image --force    # rebuild anyway, e.g. to pick up newer packages
```

在笔记本上约 45 秒: provision 30 到 40 s，pack 2 s，之后 trace boot 约 3 s。某个 unkernel 版本的第一次构建还会下载它的 Alpine image (4 MB)。
输入未变、但 manifest 还没有 boot trace 时，构建只做 trace boot

大部分时间花在 apk 下载包上，所以构建会同时从官方 CDN 和几个大型 mirror 下载 guest 的包索引 (`v3.24/main/aarch64/APKINDEX.tar.gz`)，然后从最快的那个安装；在某些网络下，官方 CDN 只有约 30 KB/s，而附近的 mirror 有 1 MB/s。
设置 `ALPINE_MIRROR=https://…` 可以跳过这次探测。apk 在选中的 mirror 上失败时，`setup.sh` 会改从官方仓库重新安装，image 里保留的也是官方仓库。
构建 5 分钟后 (`--timeout-min`) 报错停止，并给出需要检查的 mirror

Input hash 覆盖 `image/` 下的所有文件和已安装的 `unkernel` 版本，后者确定了 Alpine image。
包来自线上的 Alpine 3.24 仓库，zsh 插件来自各自的默认分支，所以 hash 相同的两次构建可能不同；image 的 stamp 记录了插件的 commit

Deck 的 `build` 脚本在 `slidev build` 之前运行 `build:image`，所以站点构建 (仓库根目录的 `pnpm build`，CI 在每次 push 时运行) 总会带上最新的 image


## `guest/setup.sh` 做了什么

1. 检查 `/` 是 kwdata disk 上的 overlay，且 upper 也在这个 disk 上 (`/run/kw-base` 中有 `upper=data`)；upper 如果在 tmpfs 上，安装的内容会丢失
2. 启用 Alpine 的 community 仓库，用 `apk add --no-cache` 安装 `packages.txt` 中的全部包
3. 把 `rootfs/` 复制覆盖到 `/`，把 root 的 shell 设为 `/bin/zsh`。
   检查 `bat --version`、demo 脚本的语法、bat 能否渲染示例文件，以及 `base64 -w0` 能否读取 demo 图片
4. 检查 tmux: `tmux-256color` 的 terminfo 条目存在 (配置里的 `default-terminal`)，且配置加载没有报错
5. 把 jovial 和 fast-syntax-highlighting clone 到 `~/.local/share/zsh-plugins/` (`git clone --depth 1`，默认分支)；jovial 只保留 `jovial.zsh-theme`、`jovial.plugin.zsh` 和 `LICENSE`，fast-syntax-highlighting 去掉 git 历史、截图和测试。
   插件只能是这两个，否则构建失败
6. 用 `zcompile` 编译 zsh 启动时读取的文件: `.zshrc`、jovial 的两个文件，以及 fast-syntax-highlighting 加载时 source 或 autoload 的文件 (见 [Shell 启动耗时](#shell-启动耗时))
7. `node`、`python3` 或 `zoxide` 如果作为其他包的依赖被装进来，构建失败。
   unkernel 的 base 在 `/usr/lib/kw/bin` 放了一些 shim，首次使用时才安装 node、npm、bun 等，这些不算
8. 关闭网络，基于编译后的文件重新启动 `zsh -i`，并像页面在第一个 prompt 之后那样加载 fast-syntax-highlighting；任何 stderr 输出都会让构建失败，以保证页面离线启动时干净无报错。
   以下情况也会失败: fast-syntax-highlighting 的 `$FAST_WORK_DIR` 不是 `~/.config/fsh`，或其中的 `secondary_theme.zsh` 没有加载插件的 secondary theme (见 [Secondary theme 的下载](#secondary-theme-的下载))；某个编译文件比源文件旧，这时 zsh 会忽略它
9. 写入 `/etc/terminal-glance-image` (input hash、unkernel 版本、lower image id、构建时间、两个插件的 commit)
10. 删除 apk 和 shell 的缓存、历史记录和临时文件
11. `fstrim /data`: driver 把 discard 转成写零，所以释放的块会变成全零 chunk，不会被发布
12. 检查 `/data/distros/alpine/lower` 记录的是它运行时所用的 Alpine image，且没有待处理的 `discard` 请求，这样页面 boot 时会原样保留 upper


## Shell 与 tmux 配置

| 文件 | 来源 | 改动 |
| --- | --- | --- |
| `rootfs/root/.zshrc` | jovial 的 README，[Manually Install Without oh-my-zsh](https://github.com/zthxxx/jovial#manually-install-without-oh-my-zsh)；历史记录配置来自 Oh My Zsh 的 [`lib/history.zsh`](https://github.com/ohmyzsh/ohmyzsh/blob/c0140703a53eb0d22be44f7bac318d0baacc927c/lib/history.zsh) | 直接 source jovial 主题和 `jovial.plugin.zsh`，不用插件管理器，也没有补全系统，并在第一个 prompt 之后立即加载 fast-syntax-highlighting。把 fast-syntax-highlighting 的 `FAST_WORK_DIR` 设为 `~/.config/fsh` ([Shell 启动耗时](#shell-启动耗时))。历史记录写入 `~/.zsh_history`，200 条，采用 Oh My Zsh 的选项，`hist_expire_dups_first` 除外；各终端共享历史，保留到页面刷新为止，因为 guest disk 的写入只保存在内存里 |
| `rootfs/root/.config/tmux/tmux.conf` | [zthxxx/tmux-config `tmux.conf`](https://github.com/zthxxx/tmux-config/blob/main/tmux.conf) | 去掉了全部插件 (TPM、resurrect、continuum、treemux) |

每个文件的开头记录了它取自的上游 commit。
这份配置里 tmux 的 prefix 是 **Ctrl-S**；deck 的 tmux Step 用 `Ctrl-S l` 向右分屏。Root 的 `.zshrc` 把 `/usr/local/bin` 加入 `PATH`，所以 demo 命令可以直接用名字运行


### Shell 启动耗时

在浏览器里的 VM 中，每个 zsh 插件都会拉长第一个 prompt 出现之前的时间，所以 image 只加载演讲需要的两个：主题，以及让输入的命令更易读的语法高亮。
Demo 用不到的包 (node、python、zoxide) 不装，以减小下载量

在 VM 中，zsh 启动的耗时花在脚本执行的语句上，不在脚本启动的进程上。在 guest 中实测：

| 操作 | 耗时 |
| --- | ---: |
| 一条 zsh 语句 (`x=$((i*2))`) | 29 µs |
| Subshell (`x=$(:)`) | 0.27 ms |
| `/bin/true` 的 fork 和 exec | 0.72 ms |
| `zmodload zsh/zle` | 4.9 ms |

一条 zsh 语句的耗时约为原生的 30 到 100 倍，所以 prompt 之前的几千条语句要花几百毫秒

页面原来用 zinit 启动 login shell，对这个 shell 做 trace (`xtrace`，每条语句带时间戳)，统计到 zinit 中 2693 条语句，fast-syntax-highlighting 的加载中 1526 条，jovial 中 847 条。即使编译过，source `zinit.zsh` 也要 121 到 138 ms。
zinit 加载插件期间，会把 `autoload`、`zle -N`、`bindkey` 和各个 hook 函数替换成记录插件定义内容的版本 (`:zinit-tmp-subst-*`)；仅它的 `autoload` 在 jovial 的加载中就执行了 110 条语句，在 fast-syntax-highlighting 的加载中执行了 661 条，fast-syntax-highlighting 会包装 zle 的全部 386 个 widget。
fast-syntax-highlighting 的这次加载耗时 0.3 到 0.6 s，期间输入的按键不会 echo。`compinit` 又花了 50 ms

所以 `.zshrc` 不用插件管理器，也没有补全系统：

- 它直接 source `jovial.zsh-theme` 和 `jovial.plugin.zsh`，与 jovial README 中不用插件管理器的安装方式一致
- 它在 `/dev/null` 上注册一个 `zle -F` handler 来加载 fast-syntax-highlighting；这个文件立即可读，所以第一个 prompt 一画出来，zle 就会运行这个 handler (这是 [zsh-defer](https://github.com/romkatv/zsh-defer) 的做法)。
  加载期间 zsh 不读取按键；这期间输入的按键在加载结束后才读取并高亮，handler 本身是一个 widget，会高亮它运行之前已输入的那一行
- 第 6 步编译了它 source 的脚本：对于被 source 的脚本、启动文件或 autoload 函数，只要 `file.zwc` 比原文件新，zsh 就读取它来代替原文件 ([zshbuiltins(1), `zcompile`](https://zsh.sourceforge.io/Doc/Release/Shell-Builtin-Commands.html))

页面上现在的 login shell，从调用 `vm.spawn` 开始计时 (运行 3 次，jovial 中最慢的几个函数用 wrapper 计时)：

| 阶段 | 耗时 |
| --- | ---: |
| `vm.spawn` | 10 到 18 ms |
| `/etc/zsh/zshenv`、`/etc/profile` (由 `/etc/zsh/zprofile` 调用) 和 `/etc/zsh/zshrc` | 约 13 ms |
| Source jovial 的主题和插件 | 33 到 35 ms |
| jovial 的第一次 precmd | 77 到 82 ms |
| · 各 segment 的长度，每个 affix 走一遍 regex 循环 (`@jov.init-affix`) | 35 到 42 ms |
| · 在 zpty 中启动的 dev-env 探测，每个 prompt 都新起一个进程 (`@jov.async-dev-env-detect`) | 15 到 18 ms |
| · 终端背景色的回复和配色 (`@jov.theme-detect`) | 9 到 16 ms |
| Prompt 本身，`$(@jovial-prompt)` | 5 到 7 ms |
| **Prompt 出现在页面上** | **174 到 182 ms** |
| fast-syntax-highlighting 加载完成，重新开始读取按键 | 273 到 290 ms |

原来使用 zinit 和 `compinit -C` 时，zsh 启动后 390 到 405 ms 才到 prompt (脚本编译之前是 500 到 600 ms)，fast-syntax-highlighting 的加载在 prompt 之后 0.3 到 0.6 s 才结束。
Image 也小了 7.5 MiB: zinit 和插件的 git 历史、文档在 guest 中占 11 MiB，现在两个插件只占 0.9 MiB

两个 shell 同时启动时 (比如有两个终端的 slide)，它们共用 VM 唯一的 CPU，各自在约 0.3 s 后显示 prompt。剩下的耗时大多是 jovial 的第一次 precmd

高亮 deck 中的一行命令，每次重绘耗时 8 到 32 ms；第一次输入带有专属 highlighter 的命令 (chroma，比如 `git`) 时，最长要 0.16 s

#### Secondary theme 的下载

现象：第一个 prompt 之后最先输入的几个按键，约 5 s 内什么都不显示，之后一起出现

原因：在 `$FAST_WORK_DIR/secondary_theme.zsh` 缺失时，fast-syntax-highlighting 每次启动都会用 curl (或 wget) 从 GitHub 把 `share/free_theme.zsh` 下载到这个路径，然后 touch 它 (`fast-syntax-highlighting.plugin.zsh` 第 366 到 377 行，zdharma-continuum [4672ad5](https://github.com/zdharma-continuum/fast-syntax-highlighting/blob/4672ad5/fast-syntax-highlighting.plugin.zsh#L366-L377))。
Work dir 默认是 `~/.cache/fast-syntax-highlighting`，不可写时用 `~/.cache/fsh` (第 47 到 62 行)，而第 10 步会清空 `~/.cache`，所以页面上的每次 boot 都缺这个文件。
Guest 中的 `curl` 是 unkernel 基于 busybox wget 的 shim (`/usr/local/bin/curl`，自 0.2.0 起包含在它的 Alpine image 中)，而页面上的 guest 只有 loopback 接口，所以 wget 的域名解析 (musl，`nameserver 10.0.2.3`) 要 5 s 才失败，直接按地址连接则会立即失败。对插件的加载做 trace，`curl` 命令耗时 5.03 s

改动：

- `.zshrc` 在加载插件之前把 `FAST_WORK_DIR` 设为 `~/.config/fsh`；这个目录可写时，插件会沿用这个设置
- Image 带上 `rootfs/root/.config/fsh/secondary_theme.zsh`，它 source 插件自带的 `share/free_theme.zsh` (`$FAST_BASE_DIR` 是插件的目录)，与下载得到的是同一个文件，只是改为从 disk 读取
- Secondary theme 负责嵌套代码的样式，即 `$(…)` 内部、反引号和 `eval` 字符串: highlighter 通过 `FAST_HIGHLIGHT_STYLES[secondary]` 切换到它，默认值为 `free`；只要没有设置 `FAST_HIGHLIGHT_STYLES[freedefault]`，就会 source 这个文件 (`fast-highlight`)。
  在 `"$(base64 -w0 x)"` 中，`base64` 以 `fg=180` 绘制，`-w0` 以 `fg=110` 绘制，与联网安装时一致；文件为空时它们没有样式
- 第 8 步要求 `$FAST_WORK_DIR` 为 `~/.config/fsh`，且 source 其中的 `secondary_theme.zsh` 会设置 `freedefault`，否则构建失败。
  构建每次都 clone 插件的默认分支，所以上游如果有改动让下载重新出现，构建会停止，这个问题不会带到页面上

在页面中实测，slide 5 的第一个终端，在第一个 prompt 出现后立即以每键 40 ms 输入 `uname -a`：

| 指标 | 改动前 | 改动后 |
| --- | --- | --- |
| 第一个按键 → 它的 echo | 5051 ms | 19 到 23 ms |
| 第一个 prompt → `uname -a` 的输出 | 5354 ms | 650 到 666 ms |

要查看插件加载的时间花在哪里，可以在页面的终端里对它做 trace；输出的每一行都运行了超过 0.1 s，行首是耗时：

```zsh
cat > /tmp/highlighting.zsh <<'EOF'
zmodload zsh/datetime
PS4='+$EPOCHREALTIME %N:%i> '
setopt xtrace
.terminal-glance-load-highlighting
EOF
zsh -i -c 'source /tmp/highlighting.zsh' 2>/tmp/highlighting.trace
awk '/^\+[0-9]/ { t = substr($1, 2); if (p && t - p > 0.1) printf "%.2f s  %s\n", t - p, last; p = t; last = $0 }' /tmp/highlighting.trace
```


## 终端协议的演示

`terminal-colors` (`rootfs/usr/local/bin/terminal-colors`) 用 OSC 11 查询终端，并把回复同时输出为转义后的字节和 RGB 值。
它打开 `/dev/tty`，保存终端设置，在读取回复期间关闭 echo 和 canonical input，退出或被中断时恢复保存的设置。它接受 BEL 和 ST 两种终止符，两秒后放弃

`bat /root/hello.sh` 每次运行都会检测终端当前的颜色：它的 `--theme` 默认为 `auto`。
Alpine 3.24 安装的是 **bat 0.26.1**；它的 [`src/theme.rs`](https://github.com/sharkdp/bat/blob/v0.26.1/src/theme.rs) 用 terminal-colorsaurus 1.0.1 发送 OSC 10/11 查询和一个 DA1 sentinel。
[`--theme` 的帮助](https://github.com/sharkdp/bat/blob/v0.26.1/src/bin/bat/clap_app.rs) 区分了 `auto` (stdout 是终端时查询)、`auto:always` (重定向时也查询) 和 `auto:system` (macOS 系统偏好)。这个 guest 应使用 `auto`

`/root/chinatsu-bot-avatar.jpeg` (1080 × 1080, 67 KiB) 和 `/root/chinatsu-bot-avatar.png` (同一张图缩到 256 × 256，76 KiB，用 `sips -s format png -Z 256` 生成) 是图片 demo 用的文件 (`pages/terminal-images.md`): JPEG 走 iTerm2 协议，PNG 走 kitty 协议，kitty 协议接受 PNG (`f=100`)，不接受 JPEG。
两者都是 Git LFS 文件，因为 `.gitattributes` 跟踪了 `*.jpeg` 和 `*.png`

`agent-status-demo` (`rootfs/usr/local/bin/agent-status-demo`) 以 `app=ClaudeCode` 的身份，发送 `working`、`blocked` 和 `done` 三种状态的 OSC 7501 report。到 `blocked` 时按 Enter 继续；最后的 `done` 状态会一直显示。
它只是协议演示，背后没有 Coding Agent 或网络服务。序列格式参照 botmux `cb8ff44b2` 的 `src/utils/program-status-parser.ts`


## 发布格式

`public/linux/manifest.json`，由 `runtime/disk.ts` 读取 (类型是 `image/pack.ts` 中的 `DiskManifest`)。顶层是 data disk；`distro` 是 unkernel 的 Alpine image，打包方式相同：

```json
{
  "format": "terminal-glance/disk@2",
  "label": "kwdata",
  "unkernel": "0.2.0-261124-c08e977",
  "inputHash": "<sha256 of image/ and the unkernel version>",
  "size": 4294967296,
  "chunkSize": 1048576,
  "encoding": "gzip",
  "chunks": { "<index>": "chunks/<first 16 hex of sha256(raw chunk)>.gz" },
  "boot": [0, 2, 1920, 34, 2048, "…"],
  "bootBundle": { "file": "boot/<first 16 hex of sha256(raw)>.gz", "blockSize": 16384, "runs": [[0, 2], ["…"]] },
  "stats": { "nonZeroChunks": 87, "uniqueChunks": 87, "rawBytes": 91226112, "compressedBytes": 21445128 },
  "distro": {
    "name": "alpine",
    "image": "alpine-3.24.4-7ab2d6761e667913",
    "sha256": "<sha256 of alpine.erofs, as in the release's distros.json>",
    "size": 4046848,
    "chunkSize": 1048576,
    "encoding": "gzip",
    "chunks": { "<index>": "distro/chunks/<first 16 hex of sha256(raw chunk)>.gz" },
    "boot": [0],
    "bootBundle": { "file": "distro/boot/<first 16 hex of sha256(raw)>.gz", "blockSize": 16384, "runs": [[0, 58]] },
    "stats": { "nonZeroChunks": 4, "uniqueChunks": 4, "rawBytes": 4046848, "compressedBytes": 3972421 }
  }
}
```

- Chunk `i` 保存所属 image 的字节 `[i * chunkSize, min(size, (i + 1) * chunkSize))`，经 gzip 压缩
- `chunks` 中缺失的 index 全为零
- 文件按内容命名：相同的 chunk 只存一份，同一个 URL 的内容永远不变，所以浏览器和 CDN 可以无限期缓存
- 构建最后才写入 manifest，通过 rename 完成；packer 会在每个 image 自己的目录中删除不再引用的 chunk 文件
- Alpine image 以 chunk 形式发布，没有直接用 release 中的单个文件，这样页面不需要 range request，并且能和 data disk 一样经由 boot bundle 和后台下载来读取。
  它的 erofs 数据本来就压缩过: gzip 只把 3.9 MiB 压到 3.8 MiB
- `vm/trace-boot.ts` 以页面的方式离线 boot 一次发布的 image，记录 guest 从每个 image 读取了什么，时间范围从上电开始，到 zsh 的第一个 prompt，再到之后 fast-syntax-highlighting 加载完成。
  `.zshrc` 用 iTerm2 的 SetUserVar escape (`OSC 1337 ; SetUserVar=terminal_glance_boot=<base64>`) 标记这两个时刻，不认识这个 escape 的终端会忽略它。`prompt` 标记来自一个只运行一次的 precmd hook，`plugins` 标记在 fast-syntax-highlighting 加载完成后发出。
  60 s 内没有 `prompt` 标记，构建失败；没有 `plugins` 标记时，trace 在 prompt 之后 5 s 停止
- 一个 image 的 `boot` 按首次读取的顺序列出 boot 读过的 chunk。
  它的 `bootBundle` 保存读过的字节，按 16 KiB 的块对齐: `runs` 是升序的 `[first block, block count]`，文件就是这些块依次相连，每块 16 KiB (image 的最后一块用零补齐)，经 gzip 压缩，并像 chunk 一样按内容命名
- 页面一拿到 manifest 就下载两个 bundle，与 kernel 自身的下载并行。被某个 bundle 完整覆盖的读取由这个 bundle 提供；其他读取会加载对应的 chunk。
  在当前的 image 中，boot 从 data disk 的 21 个 chunk 中读取 243 个块 (3.8 MiB)，打成 0.90 MiB 的 bundle，而这些 chunk 的 gzip 大小是 2.9 MiB；从 Alpine image 读取前 58 个块 (0.9 MiB)，unkernel 构建这个 image 时把 boot 最先读取的文件排在前面，bundle 为 0.85 MiB
- Guest 的时序会有波动，所以同一个 image 的两次 trace 可能相差几个块；在页面上，这样的读取会加载对应的 chunk
- Manifest 有 `boot` 但没有 bundle，或者 bundle 下载失败时，改为每次 6 个并发获取这些 chunk；两者都没有的 manifest 在 boot 时完全按需加载。
  Prefetch 的 chunk 会一直留在内存中，直到 guest 读取它
- Shell 第一次写出输出 (它的第一个 prompt) 时，或 kernel 启动 5 s 后，以先到者为准，并且等页面空闲后，页面会下载所有尚未获取的 chunk: Alpine image 的排在最前，然后按 disk 顺序下载 data disk 的，每次两个 (构建产物中以低优先级下载)，这样程序第一次运行 (htop、bat、tmux) 时就能从内存读取。
  每个获取到的文件都按发布时的 gzip 形式保留 (`ImageFiles`)，两个 image 共 24 MiB；guest 读取时才解压对应的 chunk，任何文件都不会下载两次。Guest 仍然没有网络：这些是页面为自己的 disk 发出的请求

`test/disk.test.ts` 双向检查这个 contract: `pack.ts` 发布的任何内容，`runtime/disk.ts` 都能逐字节读回


## 体积

基于当前包列表的数据：

| 指标 | 大小 |
| --- | --- |
| apk 安装的内容 (68 个包，含 Alpine 自身的包) | 65.6 MiB |
| Guest 中的 upper layer (其中两个 zsh 插件占 0.9 MiB) | 67 MiB |
| Data disk: 非零数据 | 87 个 chunk，87 MiB |
| Data disk: 发布的大小 (gzip) | **20.5 MiB** |
| Data disk: boot bundle (gzip)，即 boot 读取的 243 个 16 KiB 块 | 0.90 MiB |
| Alpine image (`alpine.erofs`): 发布的大小 (gzip) | 3.8 MiB，原始 3.9 MiB |
| Alpine image: boot bundle (gzip)，它的前 58 个块 | 0.85 MiB |

页面立即下载 boot bundle，其余 chunk 在第一个 prompt 之后后台下载；在此之前，bundle 之外的读取会立即获取对应的 chunk。
GitHub 拒绝 push 超过 100 MB 的文件；每个 chunk 约 1 MiB


## 修改 image

| 任务 | 改动 |
| --- | --- |
| 增删工具 | `image/guest/packages.txt`，然后运行 `pnpm build:image` |
| 修改 shell 或 tmux 配置 | `image/guest/rootfs/root/.zshrc`、`image/guest/rootfs/root/.config/tmux/tmux.conf` |
| 向 guest 添加文件 | 按 guest 中的路径放到 `image/guest/rootfs/` 下 |
| 升级 `unkernel` | 见 [升级 unkernel](#升级-unkernel) |

改完后在页面中检查结果 (`pnpm dev terminal-glance`)：新开的终端必须显示 jovial 的 prompt 且没有报错行，工具也必须能运行


### 升级 unkernel

unkernel 是 prerelease，一次发布就可能同时改变 guest 的 CPU、kernel 文件、guest image 和 SDK: 0.2.0 四项都改了。升级到新版本时：

1. 阅读变更: deck 当前版本之后的 commit (`gh api repos/pithings/unkernel/compare/<old>...<new>`)，以及新包的 `README.md`、`dist/web.d.mts` 和 `dist/node.d.mts`
2. 更新 `pnpm-workspace.yaml` 中的 catalog 版本，运行 `pnpm install`。Release 中的 `unkernel.tgz` 就是 npm tarball；npm registry 慢时，可以用 `gh release download` 下载
3. 运行 `pnpm build:image --force` 和测试，并对照新版本逐项检查下表列出的位置
4. 打开 deck (`pnpm dev terminal-glance`)，检查第一个 prompt、`uname -a`、htop 显示的 CPU 数和内存、一张有两个终端的 slide。
   按 [performance.md](./performance.md) 描述的方法测量 boot，并更新注释、文档和 speaker notes 中引用的版本和 commit

从 0.1.0 到 0.2.0 的变化，以及 deck 依赖这些变化的位置：

| 变化 | 位置 |
| --- | --- |
| Kernel 文件: `unkernel/alpine.wasm` (带 Alpine initramfs 的 kernel) 换成了 `unkernel/unkernel.wasm` (带 base initramfs 的 kernel) | `vite.config.ts` (asset、它的 preload、`__KERNEL_WASM_BYTES__`)、`runtime/kernel.ts`、`image/vm/provision.ts` |
| 每个 distro 是 GitHub release 中单独的 erofs image，大小和 SHA-256 列在 `distros.json` 中 | `image/vm/distro.ts` (`fetchDistro`)、每个 `createKernel` 中的 `distro`、manifest 的 `distro` 部分 |
| Guest CPU: riscv64 换成了 aarch64 | `image/build.ts` 中的 `ALPINE_INDEX` (mirror 探测)、提到架构的 speaker notes |
| Data disk 的 upper layer: `/data/overlay/upper` 换成了 `/data/distros/<name>/upper`，不再有 boot marker | `image/guest/setup.sh` (`OV`、overlay 检查) |
| Session 和 `exec` 默认以用户 `user` (uid 1000) 运行，除非指定其他用户 | `runtime/session.ts`、`image/vm/provision.ts`、`image/vm/trace-boot.ts` 中的 `user: 'root'` |
| Guest 的工具合并成一个程序: `kwtty serve` 改为以 `kwbox tty serve` 运行，源码移到 `guest/src/` | Speaker notes 和源码链接 (`pages/terminal-layers.md`、`pages/keystroke.md`、`slides.md`) |
| Base layer 在 `/usr/lib/kw/bin` 放了一些 shim，首次使用时安装 node、npm、bun 等 | `setup.sh` 中的依赖检查 |
| 桌面端的 guest 内存默认 2 GiB | `runtime/kernel.ts` 中的 `GUEST_MEMORY_MIB` |
| 多个 CPU: kernel bundle 带有 SMP patch，每个 CPU 运行在一个线程中 | `runtime/kernel.ts` 中的 `loadKernelModule(…, { smp })`、[isolation.md](./isolation.md) |
| Web 入口内联了它的 Web Worker 模式 (`terminal` chunk 的 gzip 大小多了 64 KB) | [performance.md](./performance.md#剩余开销) |
