Claude Code / Codex / Neovim 怎样控制整屏？

<div class="text-[30px] w-full">

| 层次 | 机制 | 谁处理 |
| --- | --- | --- |
| 逐键输入 | [termios](https://man7.org/linux/man-pages/man3/termios.3.html)：关闭行缓冲、回显等 | 内核 TTY |
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
