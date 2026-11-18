---
theme: eloc
routerMode: hash
---

## Terminal 概览 (其一)

Terminal / Shell / 输入输出

<!--
- 本系列想把每天都在用、却说不清的几个概念讲明白：Terminal、TTY、Shell，以及它们和进程怎么协作
- 「其一」只讲输入输出：一个按键从键盘到屏幕走过的完整路径
- 演示用的是页面里直接运行的真实 Linux 内核 (unkernel，Alpine 3.24 riscv64)，预装 zsh + jovial、bash、tmux、htop、git、less、bat、nvim，不需要联网；会后每个人打开这个页面都能自己重做一遍
-->

---

- 我们常说的 Terminal / Shell / Console / TUI / CLI 具体是什么？
- Claude Code / Codex TUI 启动时占满独立全屏怎么实现的？
- Herdr / Tmux 看起是里面又装了一层 Terminal ？
- Botmux Agent 网关能让自己和用户同时在一个终端中输入，是怎么实现的？
- Terminal / Shell 还有什么能力？

---
src: ./pages/keystroke.md
---

---
src: ./pages/terminal-history.md
---

---
src: ./pages/tty-pty.md
---

---
src: ./pages/ansi-stty.md
---

---
src: ./pages/osc.md
---

---
src: ./pages/tui.md
---

---
src: ./pages/agent-gateway.md
---

---

\> To Be Continued

<!--
- 这次讲了：终端与 TTY 的分工、PTY 和前台进程组、ANSI 与 stty、跨机器的 OSC 查询、全屏 TUI，以及 Agent 网关的共享输入和状态监控
- 下期预告：session、进程组和控制终端的关系；SIGHUP、nohup，以及 tmux 为什么断线后进程不退出；守护进程怎么脱离终端
-->

---

Ref Docs:

- https://en.wikipedia.org/wiki/Computer_terminal
- https://en.wikipedia.org/wiki/Teleprinter
- https://en.wikipedia.org/wiki/Terminal_emulator
- https://en.wikipedia.org/wiki/ANSI_escape_code
- https://stackoverflow.com/questions/18811129/full-screen-terminal-application-with-ruby-or-other-languages
- https://stackoverflow.com/questions/11023929/using-the-alternate-screen-in-a-bash-script

<!--
- 维基百科四个词条：终端、电传打字机、终端模拟器、ANSI 转义序列
- 两篇 StackOverflow 讲全屏终端程序和 alternate screen，对应前面备用屏幕的演示
-->

---

Ref Docs: Control Protocols

- [OSC · XTerm Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Operating-System-Commands)
- [OSC 7501 · Program Status Protocol](https://www.superlogical.com/rex/docs/build/program-status)
- [bat 0.26.1 · 终端配色](https://github.com/sharkdp/bat/tree/v0.26.1)
- [Ghostty · Synchronized Output](https://ghostty.org/docs/help/synchronized-output)
- [botmux · tmux pipe backend (cb8ff44b2)](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/adapters/backend/tmux-pipe-backend.ts)

<!--
- 新增的控制序列、状态协议和网关实现，原始来源也分别放在对应页面的 notes
- botmux 链接固定到实际核对的 commit，便于检查实现路径
-->

---

Ref Pictures & Flow:

- https://en.wikipedia.org/wiki/Computer_terminal
- https://segmentfault.com/a/1190000016129862
- https://segmentfault.com/a/1190000009082089

<!--
- printempw《命令行界面 (CLI)、终端 (Terminal)、Shell、TTY，傻傻分不清楚？》：理清概念，讲清终端与 shell 的分工
- public0821《Linux TTY/PTS 概述》：TTY 子系统、ssh 加 pty 的数据流、stty 配置和 TTY 相关信号；它的续篇讲进程与会话
-->

---

<p>
  <a href="https://github.com/zthxxx" target="_blank" rel="noopener">
    <img
      alt="zthxxx"
      src="https://avatars.githubusercontent.com/u/15135943"
      class="w-52 h-52 rounded-full border-2 border-gray-300"
    />
  </a>
</p>

[![zthxxx](https://badgen.net/badge/github/zthxxx/blue?icon=github&label&scale=2)](https://github.com/zthxxx)

[ [jovial](https://github.com/zthxxx/jovial) · [zsh-history-enquirer](https://github.com/zthxxx/zsh-history-enquirer) · [midk](https://github.com/zthxxx/midk) ]

<!--
- 谢谢大家，Q&A
- 页面里的终端是编译成 WebAssembly 的真实 Linux 内核 (unkernel)，打开 slides.zthxxx.me 就能自己重做所有演示
-->
