Claude Code / Codex / Neovim 怎样控制整屏？

<div class="tui-cards">
<div class="card">
  <span class="who kernel">内核 TTY</span>
  <div class="what">逐键读输入</div>
  <code>stty -icanon -echo</code>
  <div class="how">不等回车，每个键立刻交给程序；回显由程序自己画</div>
</div>
<div class="card">
  <span class="who emulator">终端模拟器</span>
  <div class="what">画满整屏</div>
  <code>CSI ?1049h · CSI r;cH · CSI 2J</code>
  <div class="how">切到备用屏幕，按坐标画字；退出时 <code>?1049l</code> 恢复原屏幕</div>
</div>
<div class="card">
  <span class="who emulator">终端模拟器</span>
  <div class="what">鼠标、粘贴、焦点</div>
  <code>CSI ?1000h · ?2004h · ?1004h</code>
  <div class="how">程序申请后，终端把这些事件编码成字节送回输入流</div>
</div>
<div class="card">
  <span class="who emulator">终端模拟器</span>
  <div class="what">一帧一次显示</div>
  <code>CSI ?2026h … CSI ?2026l</code>
  <div class="how">一批重绘先缓着，结束时一起显示，减少闪烁</div>
</div>
</div>

<div class="text-[24px] mt-5 opacity-80">程序能用的只有两样：用 termios 改 TTY 的行为，往输出里写控制序列</div>

<style>
.tui-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; width: 100%; margin-top: 16px; text-align: left; }
.tui-cards .card { border: 1px solid rgb(127 127 127 / 0.3); border-radius: 14px; padding: 16px 22px; background: rgb(127 127 127 / 0.06); }
.tui-cards .who { display: inline-block; font-size: 16px; line-height: 1.6; padding: 0 10px; border-radius: 999px; }
.tui-cards .who.kernel { color: rgb(8 145 178); background: rgb(8 145 178 / 0.12); }
.tui-cards .who.emulator { color: rgb(217 119 6); background: rgb(217 119 6 / 0.12); }
.tui-cards .what { font-size: 30px; font-weight: 600; margin: 6px 0 8px; }
.tui-cards .card > code { font-size: 20px; }
.tui-cards .how { font-size: 19px; opacity: 0.75; margin-top: 8px; }
.tui-cards .how code { font-size: 17px; }
</style>

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
  <ShellStep run="echo before the TUI" />
  <ShellStep run="nvim /root/hello.sh" />
  <ShellStep run=":q!" />
  <ShellStep run="less /root/hello.sh" />
  <ShellStep type="q" />
  <ShellStep run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["
echo -n "${CSI}?1049h${CSI}H"' />
  <ShellStep run="echo inside the alternate screen" />
  <ShellStep run='echo -n "${CSI}?1049l"' />
</ShellDemo>

<!--
- nvim 启动后接管按键处理与屏幕绘制；本演示保持普通模式，输入 :q! 回车退出。若手动进入了插入模式，要先按 Esc
- less 内部用 j/k 或方向键移动，q 退出；观察两个程序退出后，before the TUI 和 shell 提示符仍在原屏幕
- 最后三步手动做一遍它们进出备用屏幕的动作：声明 ESC、CSI 后 `echo -n "${CSI}?1049h${CSI}H"`，屏幕清空，提示符出现在左上角，这是备用屏幕；在里面 echo 一行字；再 `echo -n "${CSI}?1049l"` 回到主屏幕，before the TUI 和之前的命令原样还在，备用屏幕里的那行字消失
- 1049h 进入时保存光标位置并切换缓冲区，1049l 切回主缓冲区并恢复光标；`${CSI}H` 只是把光标移到左上角，nvim、less 进入时也会自己清屏重画
- 窗口变化也没有创建新 shell：宿主更新 PTY 尺寸，内核发送 SIGWINCH，TUI 根据新尺寸重绘
- 这是实际运行的 nvim 与 less。它们根据 TERM/terminfo 和终端能力选择控制序列，并非所有 TUI 都硬编码同一套模式
-->
