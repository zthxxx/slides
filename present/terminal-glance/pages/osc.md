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

[OSC 11](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h4-Operating-System-Commands:OSC-Ps;Pt-ST:Ps-=-1-1.1016) terminal query

<ShellDemo>
  <ShellStep run="terminal-colors" />
  <ShellStep run="bat /root/hello.sh" />
  <ShellStep run="exec zsh" />
</ShellDemo>

<!--
- 查询字节是 `ESC ] 11 ; ? ST`，用前面声明的变量写就是 `printf "${OSC}11;?${ST}"`；回答形如 `ESC ] 11 ; rgb:2727/2929/3636 ST`，每个通道用十六进制表示
- 现场手动演示：运行 terminal-colors，看到转义后的回复和 RGB 值；点任意终端标题栏的颜色按钮，再查询一次，颜色值随当前终端主题改变
- terminal-colors 临时关闭规范模式和回显，带超时读取 BEL/ST 结尾的回复，并恢复 termios。直接在提示符运行裸 printf 只会发问，回复还可能落进 shell 的输入流
- 手动运行 bat，再切颜色、重新运行 bat：bat 0.26.1 默认的主题就是 auto，每次启动查询终端背景色，再选择浅色或深色语法主题；文件只有几行，一屏放得下，bat 直接输出不进入 pager
- jovial 在初始化时决定 prompt 配色；切换后已有 shell 的 prompt 不保证立刻换色，exec zsh 重新初始化。终端调色板变化和应用重新选择自己的配色，是两个动作
- 颜色按钮对所有页面的终端生效，偏好保存在浏览器 localStorage。刷新保留的是颜色偏好，Linux 仍然重新开机
- 来源：[bat v0.26.1 的主题选项](https://github.com/sharkdp/bat/blob/v0.26.1/src/bin/bat/clap_app.rs)、[jovial 终端配色检测](https://github.com/zthxxx/jovial/blob/master/jovial.zsh-theme)
-->

---

[OSC 7501](https://www.superlogical.com/rex/docs/build/program-status#program-status-protocol-osc-7501)：程序主动汇报状态

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

[OSC 7501](https://www.superlogical.com/rex/docs/build/program-status#program-status-protocol-osc-7501) - 模拟 Agent，观察终端标题栏的状态

<ShellDemo>
  <ShellStep run="agent-status-demo" />
  <ShellStep keys="⏎" />
  <ShellStep run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["; OSC="${ESC}]"; ST="${ESC}\\"
printf "${OSC}7501;state=working:app=demo-agent${ST}"' />
  <ShellStep run='printf "${OSC}7501;state=blocked:app=demo-agent:kind=permission${ST}"' />
  <ShellStep run='printf "${OSC}7501;state=done:app=demo-agent${ST}"' />
  <ShellStep run='printf "${OSC}7501;state=clear${ST}"' />
</ShellDemo>

<!--
- 这里运行的是离线的 shell 协议演示脚本 agent-status-demo，没有模型参与；PTY、控制字节、宿主解析和标题栏显示都是真实运行的
- 运行 agent-status-demo：脚本发 working，2 秒后发 blocked:kind=permission 并等待输入。看标题栏从 working 变成 blocked
- 演讲者按 Enter，脚本继续并发 done。Enter 仍是普通终端输入；状态控制序列没有另开消息通道
- 后面四条 printf 把脚本发出的报告逐条手动再发一遍：声明 ESC、OSC、ST 后发 `${OSC}7501;state=working:app=demo-agent${ST}`，再发 blocked 和 done，最后 `state=clear` 移除状态。标题栏跟着变化，状态只是程序输出里的一段字节，终端没有去查 /proc 推断工作进展
- 页面只演示根程序的状态报告；完整网关还要处理子任务层级、启动阶段、异常退出与消息调度
- 来源：[botmux cb8ff44b2 · probe 与状态分流](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/worker.ts#L20790-L20829)
-->
