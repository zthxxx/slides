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

<div class="text-[28px]">用户继续敲，Gateway 也能写入</div>

<div class="text-[24px] opacity-70 m-3">A: 用户终端 ｜ B: 网关控制端 ｜ 共享 Agent：zsh</div>

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
| Hooks / transcript | 某个执行阶段或完成事件 | 按适配器语义校准 |
| 输出静默 / 屏幕 | 一段时间没有变化、出现提示符 | 仍可能在计算或等网络 |
| PTY 退出 / 连接断开 | 进程结束或传输不可用 | 不代表任务成功 |
| OSC 7501 | 程序自报 working / blocked / done | 需要程序支持，不可轮询 |

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
