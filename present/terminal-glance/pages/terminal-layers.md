接口固定，实现可换

<TerminalLayersDiagram />

<!--
- 前面拆开的几层之间，都隔着固定的接口：终端模拟器和对端交换的只是 VT/ANSI 字节；持有 ptmx 的一方用 read、write 搬字节，用 ioctl (TIOCSWINSZ) 改窗口大小；程序只看到 fd 0、1、2 上的 tty 和 termios 设置
- 接口不变，每一层都能换：终端模拟器可以是 iTerm2、Ghostty、kitty、Warp；持有 master 端的可以是终端模拟器自己、ssh 那头的 sshd，或者 tmux server；内核可以是 Linux、macOS；程序完全不知道对面是谁
- 页面里的终端也是这个结构。ghostty-web 负责把字节解析成字符格子并画到 canvas；按键经 unkernel 的 JS `Pty` (`vm.spawn()`) 走 vsock 的 1022 端口，进到 guest 里的 `kwtty serve`；kwtty 用 `forkpty()` 拿到 ptmx，把 root 的 login shell 放在 /dev/pts/N 上
- 在任意终端运行 `ps -o pid,ppid,args` 或 htop 能看到这一层：init 启动的 `kwtty serve` 为每个页面终端 fork 一个子进程，子进程下面就是那个终端的 `-zsh`
- kwtty 在这里的角色和 sshd 一样：把 ptmx 上的字节搬到一条传输通道上，只是通道从 ssh 换成了 vsock。内核这一层换成了编译成 WebAssembly 的 Linux，zsh、tmux、htop 都没有改动
- 来源：[unkernel kwtty.c · 每个连接一个 pty 和 login shell](https://github.com/pithings/unkernel/blob/0e4b2ecb4d677bab0b326cc56362dc38a9111af5/kernel/guest/kwtty.c#L1-L19)、[kwtty.c · forkpty](https://github.com/pithings/unkernel/blob/0e4b2ecb4d677bab0b326cc56362dc38a9111af5/kernel/guest/kwtty.c#L1014)、[js/core/tty.ts · host 端 Pty](https://github.com/pithings/unkernel/blob/0e4b2ecb4d677bab0b326cc56362dc38a9111af5/js/core/tty.ts#L1-L11)、[alpine.sh · inittab 启动 kwtty serve](https://github.com/pithings/unkernel/blob/0e4b2ecb4d677bab0b326cc56362dc38a9111af5/kernel/guest/alpine.sh#L100)、[ghostty-web README](https://github.com/coder/ghostty-web#readme)；版本对应 deck 安装的 unkernel 0.1.0-261117-0e4b2ec 和 ghostty-web 0.4.0
-->

---

iTerm2 / Ghostty / kitty / Warp 是什么

<div class="text-[26px] w-full">

| 终端 | 所在的层 | 自己加的扩展 |
| --- | --- | --- |
| iTerm2 | 终端模拟器 (macOS) | `OSC 1337` 私有序列：内联图片、标记、当前目录；`OSC 133` shell integration |
| Ghostty | 终端模拟器 | 核心库 libghostty；kitty 键盘和图形协议；本页的 ghostty-web 用它的 VT 解析器 |
| kitty | 终端模拟器 | kitty keyboard protocol (`CSI > flags u`)、kitty graphics protocol |
| Warp | 终端模拟器 | 自带输入编辑器；shell hook 发 DCS 把每条命令切成 block；内置 Agent |

</div>

<div class="text-[26px] mt-4">都在终端模拟器这一层：持有 ptmx 或连着 sshd，把按键编码成字节，把输出解析成字符格子再绘制</div>

<style>
  th:first-child, td:first-child { white-space: nowrap; }
</style>

<!--
- 回答开头的问题：iTerm2、Ghostty、kitty、Warp 都是终端模拟器，处在架构图最左边那一层。它们之间的差别在渲染、界面和各自扩展的协议，下面的 PTY、内核和 shell 完全一样
- 扩展协议都还是字节流里的转义序列，需要程序和终端两边都支持。iTerm2 用 `OSC 1337` 做内联图片、标记和当前目录上报，用 FinalTerm 开创的 `OSC 133` 标出提示符、命令和输出的边界
- kitty 定义了自己的键盘协议 (程序用 `CSI > flags u` 开启，能区分 Ctrl-I 和 Tab 这类组合键) 和图形协议；Ghostty、WezTerm、iTerm2、Warp 等也实现了这两个协议的部分或全部
- Ghostty 的核心是可嵌入的库 libghostty，其中的 VT 解析部分 (libghostty-vt) 可以单独使用；ghostty-web 把它编译成 WebAssembly 放进浏览器，后面讲的 herdr 也内置了一份
- Warp 用 zsh 的 precmd、preexec 这类 hook 在每条命令前后发一段自定义 DCS，自己据此把每条命令和输出放进独立的 block；输入框是它自己的编辑器，不再由 shell 的 zle 负责，所以 shell 里再启动的交互程序得不到这些功能
- 来源：[iTerm2 Proprietary Escape Codes](https://iterm2.com/documentation-escape-codes.html)、[Ghostty About · libghostty](https://ghostty.org/docs/about)、[Libghostty Is Coming](https://mitchellh.com/writing/libghostty-is-coming)、[kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)、[kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)、[How Warp Works](https://www.warp.dev/blog/how-warp-works)、[Will Richardson · Warp 的输入编辑器只作用于 shell 提示符](https://willhbr.net/2023/08/02/warp-terminal/)、[Warp · Block Model](https://www.warp.dev/blog/block-model-behind-warps-agentic-development-environment)
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

---

在 tmux 里看它持有的 PTY

<ShellDemo>
  <ShellStep run="tmux new -s layers" />
  <ShellStep keys="^S l" />
  <ShellStep run="tmux list-panes -F '#{pane_index} #{pane_tty} #{pane_pid}'" />
  <ShellStep run="tmux list-clients -F '#{client_tty} #{client_termname}'" />
  <ShellStep run="ls -l /proc/$(tmux display -p '#{pid}')/fd | grep -E 'ptmx|pts'" />
  <ShellStep keys="^S d" />
  <ShellStep run="tmux ls" />
  <ShellStep run="tmux attach -t layers" />
  <ShellStep run="tmux kill-session -t layers" />
</ShellDemo>

<!--
- 用镜像里真实的 tmux 验证上一页的结构；prefix 是 Ctrl-S，`^S l` 向右分屏
- `list-panes`：两个 pane 各有自己的 pts，`pane_pid` 是各自 zsh 的 pid
- `list-clients`：client 所在的 tty 是页面这个终端原来的 pts，TERM 是 xterm-256color
- `ls -l /proc/<server pid>/fd`：`#{pid}` 是 tmux server 的 pid。server 打开着两个 /dev/ptmx (每个 pane 一个 master 端)，还有 client 交过来的那个 pts，和 `list-clients` 显示的一致
- `^S d` detach：回到原来的 zsh，`tmux ls` 显示 layers 会话还在，pane 里的 shell 没有退出；`tmux attach` 回到原样
- 最后 `kill-session` 关掉这个演示会话
- 来源：[tmux(1) · FORMATS 中的 pid、pane_tty、client_tty](https://github.com/tmux/tmux/blob/3.7c/tmux.1)
-->
