OSC：程序也能向终端提问

<OscRoundTripDiagram />

<div class="text-[27px] mt-3">内核负责 TTY 行为；OSC 的通信端点是程序和终端模拟器</div>

<!--
- OSC 是 Operating System Command，序列以 `ESC ]` 开始，以 BEL 或 ST (`ESC \`) 结束；名字里的 Operating System 不代表请求由远端内核处理
- 前面的 stty 和信号演示关注内核 TTY 边界；这一页看应用层协议。程序向终端输出写查询，经 PTY、sshd、SSH channel、本地 ssh 和 PTY 到终端模拟器；回答沿输入方向回来，程序从自己的终端输入读取
- OSC 11 查询终端背景色。远端 bat 读到的是客户端终端模拟器提供的颜色，无需远端访问客户端的进程列表，也没有自动获得任意本地状态的能力
- 页面里的程序运行在 unkernel Linux，终端模拟器运行在浏览器；这里无需 SSH，仍然跨着 Linux 程序和浏览器终端的边界。图中的 SSH 是远程登录时增加的字节传输层
- tmux 还会扮演终端模拟器，可能直接回答或截获部分请求；不能假设每条扩展都能透明穿过所有中间层
- 来源：[XTerm Control Sequences · OSC 10/11](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Operating-System-Commands)
-->

---

OSC 11 terminal query

<ShellDemo>
  <ShellStep run="terminal-colors" />
  <ShellStep run="bat --paging=never --theme=auto /root/hello.sh" />
  <ShellStep run="exec zsh" />
</ShellDemo>

<!--
- 查询字节是 `ESC ] 11 ; ? ST`，例如 `printf '\033]11;?\033\\'`；回答形如 `ESC ] 11 ; rgb:2727/2929/3636 ST`，每个通道用十六进制表示
- 现场手动演示：运行 terminal-colors，看到转义后的回复和 RGB 值；点任意终端标题栏的颜色按钮，再查询一次，颜色值随当前终端主题改变
- terminal-colors 临时关闭规范模式和回显，带超时读取 BEL/ST 结尾的回复，并恢复 termios。直接在提示符运行裸 printf 只会发问，回复还可能落进 shell 的输入流
- 手动运行 bat，再切颜色、重新运行 bat：bat 0.26.1 的 --theme=auto 每次启动查询终端背景色，再选择浅色或深色语法主题；--paging=never 让演示不进入 pager
- jovial 在初始化时决定 prompt 配色；切换后已有 shell 的 prompt 不保证立刻换色，exec zsh 重新初始化。终端调色板变化和应用重新选择自己的配色，是两个动作
- 颜色按钮对所有页面的终端生效，偏好保存在浏览器 localStorage。刷新保留的是颜色偏好，Linux 仍然重新开机
- 来源：[bat v0.26.1 的主题选项](https://github.com/sharkdp/bat/blob/v0.26.1/src/bin/bat/clap_app.rs)、[jovial 终端配色检测](https://github.com/zthxxx/jovial/blob/master/jovial.zsh-theme)
-->

---

OSC 7501：程序主动汇报状态

<ProgramStatusDiagram />

<div class="text-[25px] mt-3">idle · working · blocked · done · error　 /　 clear 移除状态</div>

<!--
- OSC 11 是程序提问、终端回答。OSC 7501 的主要用途是程序主动把工作状态发给终端或 Gateway，宿主据此显示状态、安排消息或提示用户
- 探测与应答都是 ESC ] 7501 ; ? ST；支持端收到探测要应答。探测后再发 DA1，可以用 DA1 回复作为支持检测的截止标记
- 状态正文用冒号分隔 key=value，例如 state=blocked:kind=permission:app=claude。它与 OSC 编号后的分号属于不同层次
- working 表示程序自报处理中；blocked 可进一步说明 permission、question、auth；done 是一轮完成；clear 是清除状态。协议还有 id、msg、progress 等字段
- 这是应用扩展协议，不能假设任意终端或任意 Coding Agent 都支持；也不要把 OSC 9;4 的进度条或 OSC 133 的 shell 命令边界当作同一个协议
- 协议没有心跳。屏幕停了、进程活着、程序报告 done，各自是不同的观察，不能互相替代
- 来源：[Program Status Protocol rev 0.4](https://www.superlogical.com/rex/docs/build/program-status)、[botmux cb8ff44b2 · parser](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/utils/program-status-parser.ts#L14-L120)
-->

---

模拟 Agent：观察终端标题栏的状态

<ShellDemo>
  <ShellStep run="agent-status-demo" />
  <ShellStep keys="⏎" />
  <ShellStep run="printf '\033]7501;state=clear\033\\'" />
</ShellDemo>

<!--
- 这里运行的是离线 shell 协议演示脚本，不是 Claude Code，也不调用模型；实际的 PTY、控制字节、宿主解析和标题栏显示都在工作
- 运行 agent-status-demo：脚本发 working，稍后发 blocked:kind=permission 并等待输入。看标题栏从 working 变成 blocked
- 演讲者回到终端按 Enter，脚本继续并发 done。Enter 仍是普通终端输入；状态控制序列没有另开消息通道
- 最后一条 printf 发 clear，标题栏移除状态。报告是经进程输出发出的，用户和终端并没有查询 /proc 来推断工作进展
- 页面只演示根程序的状态报告；完整网关还要处理子任务层级、启动阶段、异常退出与消息调度
- 来源：[botmux cb8ff44b2 · probe 与状态分流](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/worker.ts#L20790-L20829)
-->

---

less / Neovim / Claude Code 怎样控制整屏？

<div class="text-[30px] w-full">

| 层次 | 机制 | 谁处理 |
| --- | --- | --- |
| 逐键输入 | termios：关闭行缓冲、回显等 | 内核 TTY |
| 屏幕绘制 | CSI：光标定位、清行、颜色；`?1049h/l` 备用屏幕 | 终端模拟器 |
| 交互事件 | 鼠标 `1000/1006`、粘贴 `2004`、焦点 `1004` | 终端编码，程序读取 |
| 批量重绘 | `?2026h/l` synchronized output | 终端延后显示中间帧 |

</div>

<!--
- TUI 组合多种机制：内核 termios 决定怎样交付按键；程序用 VT/ANSI 兼容控制序列把字符画到指定位置
- 备用屏幕常用于 less 和 nvim，退出后恢复原屏幕；全屏视觉效果也可以在主屏幕持续重绘。是否用备用屏幕由程序、版本和配置决定，不能看到 Claude Code 的界面就断定它必然用了 1049
- 鼠标报告、bracketed paste、focus events 都要程序先请求终端启用；序列被送回同一输入流，程序负责解码
- synchronized output 的 2026 模式把一批修改合并显示，减少重绘撕裂；这属于输出控制，和 OSC 7501 的工作状态汇报无关。是否支持要看终端实现
- 来源：[termios(3)](https://man7.org/linux/man-pages/man3/termios.3.html)、[Neovim TUI 文档](https://neovim.io/doc/user/tui/)、[Ghostty synchronized output](https://ghostty.org/docs/help/synchronized-output)、[VT synchronized output 规范](https://github.com/contour-terminal/vt-extensions/blob/master/synchronized-output.md)
-->

---

进入备用屏幕，再回到同一个 shell

<ShellDemo>
  <ShellStep run="printf 'before the TUI\n'" />
  <ShellStep run="nvim /root/hello.sh" />
  <ShellStep run=":q!" />
  <ShellStep run="less /root/hello.sh" />
  <ShellStep type="q" />
  <ShellStep run="printf 'back in the shell\n'" />
</ShellDemo>

<!--
- nvim 启动后接管按键处理与屏幕绘制；本演示保持普通模式，输入 :q! 回车退出。若手动进入了插入模式，要先按 Esc
- less 内部用 j/k 或方向键移动，q 退出；观察两个程序退出后，before the TUI 和 shell 提示符仍在原屏幕
- 窗口变化也没有创建新 shell：宿主更新 PTY 尺寸，内核发送 SIGWINCH，TUI 根据新尺寸重绘
- 这是实际运行的 nvim 与 less。它们根据 TERM/terminfo 和终端能力选择控制序列，并非所有 TUI 都硬编码同一套模式
-->

---

一个 Agent，多条输入路径

<AgentGatewayDiagram />

<!--
- 这张图对应本地 botmux cb8ff44b2 的默认 tmux pipe 后端。只有一个 Agent 进程、一个 pane PTY；IM 和 Web 是访问它的不同路径
- worker 用 send-keys 或 load-buffer + paste-buffer 写入 tmux，输出由 pipe-pane 复制到 FIFO；worker 一边解析状态，一边把输出广播给 WebSocket viewer
- 新 viewer 可以用 capture-pane 得到当前屏幕，再接实时输出。屏幕快照包含渲染后的单元格，无法还原已经被解释的所有 OSC 事件
- Web 的即时按键直接进入 backend.write；IM 消息有 turn queue 和 ready gate。两者可同时影响同一个输入区域，不能把共享终端理解成自动拥有全局输入锁
- botmux 也保留 tmux attach 路径：每个 viewer 有自己的 attach 客户端 PTY；PTY 后端则由 worker 持有 node-pty，两种情况最终仍汇入同一 Agent 的终端输入
- 来源：[botmux · tmux pipe 架构](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/adapters/backend/tmux-pipe-backend.ts#L1-L25)、[读写实现](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/adapters/backend/tmux-pipe-backend.ts#L817-L1056)、[WebSocket 输入](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/worker.ts#L33430-L33552)
-->

---

用户继续敲，Gateway 也能写入

<div class="text-[24px] opacity-70">A：用户终端　B：网关控制端　共享程序：zsh (代替 Agent)</div>

<ShellDemo terminals="a b">
  <ShellStep to="a" run="tmux new-session -A -s gateway-demo" />
  <ShellStep to="b" run="tmux pipe-pane -O -t gateway-demo:1.1 'cat >> /tmp/gateway-demo.log'" />
  <ShellStep to="b" run="tmux send-keys -t gateway-demo:1.1 -l 'echo from-gateway'" />
  <ShellStep to="b" run="tmux send-keys -t gateway-demo:1.1 Enter" />
  <ShellStep to="a" run="echo from-user" />
  <ShellStep to="b" run="tail -n 12 /tmp/gateway-demo.log | cat -v" />
  <ShellStep to="b" run="tmux capture-pane -p -t gateway-demo:1.1" />
  <ShellStep to="b" run="tmux kill-session -t gateway-demo" />
</ShellDemo>

<!--
- A 代表用户连接的 Web terminal，B 代表 Gateway 的控制端。这里用同一个 zsh 代替 Agent，演示真实 tmux 的多方输入和输出旁路，未启动 botmux 或模型服务
- A 创建并 attach 到 gateway-demo；镜像的 window 和 pane 编号都从 1 开始，因此目标是 gateway-demo:1.1。B 开 pipe-pane 记录该 pane 的原始输出；-O 选择输出方向，同一 pane 的既有 pipe 会被新命令替换，所以这页使用专属 session，不接管其他演示
- B 用 send-keys -l 把字面文本写入 A 所在 pane，不提交；观众在 A 能看到输入区域多出 echo from-gateway。下一步 B 单独发 Enter，命令执行
- A 仍可手动继续敲命令，或点 echo from-user；两个来源都写进同一个输入流。如果此时交错输入，字符可能混在一行，PTY 不提供按消息事务隔离
- B tail 日志：cat -v 显示原始控制字节；capture-pane 显示已经渲染过的屏幕，对比「订阅输出字节」和「读取屏幕快照」
- 生产网关需要按 Agent 的输入状态安排消息、区分文本粘贴与提交，并处理有写权限的实时用户操作；自动等待屏幕安静不能保证输入就绪
- 最后清理专属 tmux session，A 回到原来的 shell；重复演示前可在 B 手动清空 /tmp/gateway-demo.log
- 来源：[tmux pipe-pane / send-keys / capture-pane](https://github.com/tmux/tmux/blob/master/tmux.1)、[botmux 写入实现](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/adapters/backend/tmux-pipe-backend.ts#L928-L1056)
-->

---

Gateway 怎样知道 Agent 在等什么？

<div class="text-[30px] w-full">

| 观察 | 能知道什么 | 边界 |
| --- | --- | --- |
| OSC 7501 | 程序自报 working / blocked / done | 需要程序支持，没有心跳 |
| Hooks / transcript | 某个执行阶段或完成事件 | 按适配器语义校准 |
| 输出静默 / 屏幕 | 一段时间没有变化、出现提示符 | 仍可能在计算或等网络 |
| PTY 退出 / 连接断开 | 进程结束或传输不可用 | 不代表任务成功 |

</div>

<!--
- botmux 收到合法状态报告后，working 和 blocked 会约束 idle 判定，不能仅因屏幕静默就把它们清掉
- 同时还要处理子任务、启动 banner、prompt ready gate；部分适配器允许特定 transcript 终止证据解除过期 working，blocked 的处理更严格。不能总结成一个普遍固定的信号优先级
- IM 队列按输入就绪和 type-ahead 能力放行；blocked:permission 时要防止排队消息附带的 Enter 意外确认。Web 的即时输入另走 backend.write，仍要处理它与自动消息的竞争
- 这些观察服务于调度：什么时候可发新请求、什么时候提示人、什么时候继续等。屏幕日志和结构化状态各有自己的信息边界
- 来源：[botmux · 状态与 idle](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/utils/idle-detector.ts#L874-L989)、[blocked 输入门控](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/core/program-status-gate.ts#L52-L62)
-->

---

多一层 tmux，握手时序也会改变

<ProbeRelayDiagram />

<!--
- pipe-pane 能观察到 OSC，不意味着它的异步旁路有能力及时回答探测。botmux 遇到的问题是回复顺序：tmux 自行回答 DA1，worker 经 FIFO 再执行 send-keys 返回 7501 reply 已经晚了
- botmux 为新启动的 Claude + tmux 路径插入 pane-resident relay。relay 同步回答精确的 7501 probe，再把后续字节转发到 tmux，保证 tmux 在看到 DA1 之前，7501 reply 已经写回内层 PTY
- relay 只截获探测，状态和其他输出继续转发。既有 adopt / reattach 会话不会自动获得同样的插入路径
- 这是应用协议端点和中间层的时序问题；仅把字节接通，还不足以保证协议握手正确
- 来源：[botmux · probe relay](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/utils/program-status-probe-relay.ts#L1-L118)、[inner PTY 与转发](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/program-status-relay.ts#L75-L157)
-->
