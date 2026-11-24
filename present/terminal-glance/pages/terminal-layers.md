iTerm2 / Ghostty / kitty / Warp 是什么

<div class="text-[28px] mt-2">它们都是<b>终端模拟器</b>：持有 ptmx，把按键编成字节，把收到的字节画成字符格子</div>

<div class="emu-grid">
<div class="emu-col">
  <div class="emu-head">它们差在哪</div>
  <div class="row"><span class="k">绘制</span><span>GPU：Ghostty (Metal / OpenGL)、kitty、Alacritty、WezTerm、Warp，iTerm2 也有 GPU 渲染选项<br/>不用 GPU：xterm，本页的 ghostty-web 画在 Canvas 2D 上</span></div>
  <div class="row"><span class="k">形态</span><span>独立 App：iTerm2、Ghostty、kitty、Warp<br/>可嵌入的库：libghostty、xterm.js (VS Code 的终端)、VTE (GNOME Terminal)</span></div>
  <div class="row"><span class="k">界面</span><span>Warp 的命令 block 和输入框、iTerm2 的 tmux 集成、kitty 的 kittens、WezTerm 内置复用器</span></div>
  <div class="row"><span class="k">协议</span><span>各自的扩展序列：iTerm2 的 OSC 1337，kitty 的键盘和图片协议</span></div>
</div>
<div class="emu-col">
  <div class="emu-head">和 shell 的关系</div>
  <div class="box emu">终端模拟器<small>iTerm2 · Ghostty · kitty · Warp</small><small>按键 → 字节 · 字节 → 像素</small></div>
  <div class="link">/dev/ptmx ⇄ 内核 TTY ⇄ /dev/pts/N</div>
  <div class="box sh">shell<small>zsh · bash · fish</small><small>读命令、解析、启动程序</small></div>
  <div class="note">终端不解析命令，所以它不是 shell：同一个 iTerm2 里能跑 zsh、bash、htop、ssh，同一个 zsh 放进哪个终端都一样</div>
</div>
</div>

<style>
.emu-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 28px; width: 100%; margin-top: 18px; text-align: left; }
.emu-head { font-size: 24px; font-weight: 600; margin-bottom: 10px; }
.emu-col .row { display: grid; grid-template-columns: 3.2em 1fr; gap: 10px; font-size: 19px; line-height: 1.5; padding: 8px 0; border-top: 1px solid rgb(127 127 127 / 0.25); }
.emu-col .row .k { font-weight: 600; opacity: 0.7; }
.emu-col .box { border: 1px solid rgb(127 127 127 / 0.35); border-radius: 12px; padding: 10px 16px; font-size: 22px; font-weight: 600; text-align: center; }
.emu-col .box small { display: block; font-size: 16px; font-weight: 400; opacity: 0.75; }
.emu-col .box.emu { background: rgb(217 119 6 / 0.1); }
.emu-col .box.sh { background: rgb(8 145 178 / 0.1); }
.emu-col .link { text-align: center; font-family: var(--slidev-code-font-family, monospace); font-size: 17px; opacity: 0.7; padding: 8px 0; }
.emu-col .note { font-size: 18px; line-height: 1.5; opacity: 0.8; margin-top: 12px; }
</style>

<!--
- 一句话：iTerm2、Ghostty、kitty、Warp 都是终端模拟器，在架构里处在同一层，下面的 PTY、内核 TTY 和 shell 都一样
- 它们的差别在这一层内部。绘制：Ghostty 在 macOS 上用 Metal、Linux 上用 OpenGL，kitty、Alacritty、WezTerm 也是 GPU 渲染，Warp 用 Rust 直接在 Metal 上画，iTerm2 在设置里有 GPU Rendering 开关；xterm 和本页的 ghostty-web 不走 GPU
- 形态：有的是给用户用的 App，有的是给别的程序嵌入的库。libghostty 是 Ghostty 的核心库，ghostty-web 把其中的 VT 解析部分编译成 WebAssembly；VS Code 的内置终端是 xterm.js；GNOME Terminal 用的是 GTK 组件 VTE
- 界面和协议：Warp 把每条命令和输出放进独立的 block，提示符处的输入框是它自己的编辑器；iTerm2 能用 `tmux -CC` 把 tmux 的窗口变成原生窗口；kitty 有 kittens 小工具；WezTerm 自带复用器。扩展协议仍是字节流里的转义序列，要程序和终端两边都支持
- 和 shell 的关系：终端模拟器启动时，在 pts 上起一个程序，默认是用户的 login shell；也可以直接起 htop 或 ssh。提示符、历史、补全、别名属于 shell；字体、配色、选中复制、标签页属于终端。终端从不解析命令，所以它不是 shell
- Warp 的输入框接管了提示符处的编辑，但命令文本仍然交给 zsh、bash 或 fish 执行，shell 还在 pts 上
- 来源：[Ghostty README · Metal / OpenGL、libghostty](https://github.com/ghostty-org/ghostty#readme)、[Ghostty features](https://ghostty.org/docs/features)、[kitty](https://sw.kovidgoyal.net/kitty/)、[Alacritty README](https://github.com/alacritty/alacritty#readme)、[WezTerm README](https://github.com/wezterm/wezterm#readme)、[How Warp Works · Rust + Metal](https://www.warp.dev/blog/how-warp-works)、[iTerm2 · GPU Rendering](https://iterm2.com/documentation-preferences-general.html)、[xterm.js README · WebGL addon](https://github.com/xtermjs/xterm.js#readme)、[VTE](https://gitlab.gnome.org/GNOME/vte)、[iTerm2 Proprietary Escape Codes](https://iterm2.com/documentation-escape-codes.html)、[kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
-->

---

接口固定，实现可换

<TerminalLayersDiagram />

<!--
- 前面拆开的几层之间，都隔着固定的接口：终端模拟器和对端交换的只是 VT/ANSI 字节；持有 ptmx 的一方用 read、write 搬字节，用 ioctl (TIOCSWINSZ) 改窗口大小；程序只看到 fd 0、1、2 上的 tty 和 termios 设置
- 接口不变，每一层都能换：终端模拟器可以是 iTerm2、Ghostty、kitty、Warp；持有 master 端的可以是终端模拟器自己、ssh 那头的 sshd，或者 tmux server；内核可以是 Linux、macOS；程序完全不知道对面是谁
- 页面里的终端也是这个结构。ghostty-web 负责把字节解析成字符格子并画到 canvas；按键经 unkernel 的 JS `Pty` (`vm.spawn()`) 走 vsock 的 1022 端口，进到 guest 里的 kwtty (`kwbox tty serve`)；kwtty 用 `forkpty()` 拿到 ptmx，把 root 的 login shell 放在 /dev/pts/N 上
- 在任意终端运行 `ps -o pid,ppid,args` 或 htop 能看到这一层：init 启动的 `kwbox tty serve` (kwtty) 为每个页面终端 fork 一个子进程，子进程下面就是那个终端的 `-zsh`
- kwtty 在这里的角色和 sshd 一样：把 ptmx 上的字节搬到一条传输通道上，只是通道从 ssh 换成了 vsock。内核这一层换成了编译成 WebAssembly 的 Linux，zsh、tmux、htop 都没有改动
- 来源：[unkernel kwtty.c · 每个连接一个 pty 和 login shell](https://github.com/pithings/unkernel/blob/c08e97791caedb084f9e78b7a5baec73d641a9ec/guest/src/kwtty.c#L3-L26)、[kwtty.c · forkpty](https://github.com/pithings/unkernel/blob/c08e97791caedb084f9e78b7a5baec73d641a9ec/guest/src/kwtty.c#L1830)、[js/core/tty.ts · host 端 Pty](https://github.com/pithings/unkernel/blob/c08e97791caedb084f9e78b7a5baec73d641a9ec/js/core/tty.ts#L3-L11)、[Alpine inittab · 启动 kwbox tty serve](https://github.com/pithings/unkernel/blob/c08e97791caedb084f9e78b7a5baec73d641a9ec/guest/distro/alpine/rootfs/etc/inittab#L16)、[ghostty-web README](https://github.com/coder/ghostty-web#readme)；版本对应 deck 安装的 unkernel 0.2.0-261124-c08e977 和 ghostty-web 0.4.0
-->

---

tmux / herdr：终端里又装了一层终端

<MultiplexerDiagram />

<!--
- 回答开头的问题：是的，tmux 在中间又装了一层终端。对外层终端来说，tmux client 只是 pts/0 上的一个普通程序；对 pane 里的程序来说，tmux server 就是它们的终端模拟器
- tmux server 给每个 pane 开一个 ptmx (`fdforkpty`)，自己解析每个 pane 的输出、维护各自的字符格子，再把所有 pane 合成一个画面，重画到外层终端
- tmux client 启动后通过 unix socket 把自己 tty 的 fd 交给 server，之后 server 直接读这个 fd 拿按键、往里写画面。detach 时 client 退出，server 和 pane 里的进程继续运行，所以 ssh 断线不丢会话
- 因为 server 是 pane 的终端，pane 里程序发出的 DA1、OSC 11 这类查询由 tmux 自己回答，程序问到的是 tmux 的能力和颜色。要把序列原样送到外层终端，得包一层 passthrough：`ESC P tmux; … ESC \`，并打开 `allow-passthrough`。后面 botmux 的握手时序问题就出在这一层
- 来源：[tmux 3.7c client.c · 发送 stdin/stdout 的 fd](https://github.com/tmux/tmux/blob/3.7c/client.c#L476-L483)、[server-client.c · 接收 fd](https://github.com/tmux/tmux/blob/3.7c/server-client.c#L2501-L2504)、[tty.c · server 读写 client 的 tty](https://github.com/tmux/tmux/blob/3.7c/tty.c#L284-L285)、[spawn.c · 每个 pane 一个 pty](https://github.com/tmux/tmux/blob/3.7c/spawn.c#L391)、[input.c · 自己回答 DA1](https://github.com/tmux/tmux/blob/3.7c/input.c#L1557-L1567)、[tmux(1) · allow-passthrough](https://github.com/tmux/tmux/blob/3.7c/tmux.1#L5691-L5696)
-->

---

tmux：两个客户端看同一个会话，会话里再开 shell

<ShellDemo terminals="a b" heights="3 2">
  <ShellStep to="a" run="tty" />
  <ShellStep to="a" run="tmux new -s demo" />
  <ShellStep to="a" run="tty" />
  <ShellStep to="b" run="tmux attach -t demo" />
  <ShellStep to="b" run="echo typed in B" />
  <ShellStep to="a" keys="^S l" />
  <ShellStep to="a" run="tty" />
  <ShellStep to="a" run="tmux list-clients -F '#{client_tty}'" />
  <ShellStep to="a" run="ls -l /proc/$(tmux display -p '#{pid}')/fd 2>/dev/null | grep -oE '/dev/(ptmx|pts/[0-9]+)'" />
  <ShellStep to="b" keys="^S d" />
  <ShellStep to="a" run="tmux kill-session" />
</ShellDemo>

<!--
- A 里 `tty`：记下 A 自己的 pts
- A `tmux new -s demo`：A 的 zsh 启动 tmux client，client 连上 tmux server；server 开一对新的 PTY，在里面起一个新的 zsh。再 `tty`，已经是另一个 pts：shell 套进了 tmux
- B `tmux attach -t demo`：B 也成为这个会话的 client，画面和 A 一样。在 B 里敲 echo，A 上同步出现：两个 client 的按键都送进同一个 pane，server 把同一份画面分别画给两个 client
- A 按 `^S l` 向右分屏 (prefix 是 Ctrl-S)：server 再开一对 PTY 和一个 zsh，A、B 都多了一个 pane；新 pane 里 `tty` 又是一个新的 pts
- `list-clients`：两个 client 分别在 A、B 原来的 pts 上
- 看 tmux server 打开的 fd (`#{pid}` 是 server 的 pid)：两个 /dev/ptmx，每个 pane 一个 master 端；另外是两个 client 交过来的 pts，server 直接往里写画面。`2>/dev/null` 丢掉 ls 读到一半就关闭的临时 fd 的报错
- B 按 `^S d` detach：B 回到自己原来的 shell，会话和 pane 里的 shell 都还在，A 照常使用；断线后 attach 回来就是靠这一点。最后 A `tmux kill-session` 结束会话，回到 A 原来的 shell
- 对照上一页的图：外层终端 → client 的 pts → tmux server → 每个 pane 的 ptmx / pts → shell
- 来源：[tmux(1) 3.7c · attach、list-clients、FORMATS](https://github.com/tmux/tmux/blob/3.7c/tmux.1)
-->

---

tmux 和 herdr 有什么特别

<div class="text-[25px] w-full">

| | tmux | herdr |
| --- | --- | --- |
| 定位 | 通用的终端复用器 | 给 Coding Agent 用的终端工作区 |
| 结构 | server 持有每个 pane 的 PTY；client 交出自己的 tty fd，server 直接读写 | 后台 server 持有每个 pane 的 PTY，在内存里渲染，经 socket 把画面帧发给 client |
| 解析器 | 自己实现 | 内置 libghostty-vt |
| 会话 | detach 后 server 继续运行，attach 回来 | 关掉 client 或 SSH 断线后继续运行，再次运行 `herdr` 回到原会话 |
| 状态 | 不理解 pane 里是什么程序；`pipe-pane`、control mode 给外部程序读 | 定期读 pane 底部的屏幕文字，按 Agent 规则判断 working / blocked / idle；JSON socket API 让 Agent 互相调度 |

</div>

<style>
  th:first-child, td:first-child { white-space: nowrap; }
</style>

<!--
- 两者都是「终端里的终端」：server 持有每个 pane 的 PTY，自己解析输出，再把合成的画面送到外层终端；区别在 server 和 client 之间传什么、server 关心什么
- tmux 的 client 把 tty 的 fd 交给 server，由 server 直接往里写转义序列。herdr 的 server 不碰 client 的 tty，在内存里渲染出画面，再通过 `herdr-client.sock` 的二进制协议把帧发给 client，由 client 输出到外层终端
- herdr 不自己写 VT 解析器，内置了一份 libghostty-vt，和本页的 ghostty-web 来自同一份 Ghostty 代码
- herdr 为 Agent 加了两样东西：按每种 Agent 的 manifest 匹配 pane 底部的屏幕文字，判断它在工作、等待确认还是空闲；另一个 `herdr.sock` 提供 JSON API，Agent 可以用 CLI 开新 pane、给别的 pane 发提示词、等待某个 Agent 进入 blocked
- tmux 不理解 pane 里的程序，它提供的是通用的接口：`pipe-pane` 把输出复制给外部程序，control mode 让程序用文本命令操作 tmux。后面 botmux 的默认后端用的就是 `pipe-pane` 读输出、`send-keys` 写输入
- 来源：[herdr README](https://github.com/herdrdev/herdr/blob/ee5bfb5041bb3e4a49d591c72308aae3c81ecdde/README.md)、[herdr headless server](https://github.com/herdrdev/herdr/blob/ee5bfb5041bb3e4a49d591c72308aae3c81ecdde/src/server/headless.rs#L1-L15)、[herdr 状态检测](https://github.com/herdrdev/herdr/blob/ee5bfb5041bb3e4a49d591c72308aae3c81ecdde/src/detect/mod.rs#L1-L4)、[herdr 内置的 libghostty-vt](https://github.com/herdrdev/herdr/blob/ee5bfb5041bb3e4a49d591c72308aae3c81ecdde/vendor/libghostty-vt.vendor.json)、[tmux(1)](https://github.com/tmux/tmux/blob/3.7c/tmux.1)；tmux 对应镜像里的 3.7c，herdr 核对的版本是 0.9.5 (ee5bfb5)
-->
