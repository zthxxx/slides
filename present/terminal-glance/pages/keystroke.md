#### [在浏览器地址栏输入URL到页面展示，背后发生了什么？](https://www.zhihu.com/question/34873227)

<!--
- 经典面试题：从输入 URL 到页面展示，要经过 DNS、TCP、TLS、HTTP、渲染，每一层都能无限展开
- 我们今天也走一遍类似的「全链路」，但范围缩小到终端
-->

---

简化亿点

#### *在地址栏敲下第一个按键到显示出字母发生了什么*

<!--
- 再缩小一点：只看敲下第一个按键，到屏幕上显示出这个字母
- 就这一个字母，也要经过键盘中断、操作系统输入事件、浏览器输入框、重绘好几层
- 接下来把场景换成终端
-->

---

在**终端**里敲下按键到显示出字母发生了什么

<ShellDemo>
  <ShellStep run="uname -a" />
  <ShellStep run="cat /etc/os-release" />
  <ShellStep run="htop" />
  <ShellStep type="q" />
  <ShellStep run="echo hello" />
  <ShellStep run="showkey -a" />
  <ShellStep type="a" />
  <ShellStep keys="↑ ⏎" />
  <ShellStep keys="^D" />
</ShellDemo>

<!--
- 问题：在终端里按下一个键，屏幕上出现这个字母，中间都经过了谁？
- 整条路径的轮廓，后面逐层展开：终端模拟器把按键编码成字节，写进 ptmx，经过内核 TTY 的 line discipline 交给 shell；shell 或 TTY 再把字节写回，由终端模拟器解析并渲染
- 屏幕上的字母是回显 (echo) 回来的输出，键盘只负责发出字节

演示 (右侧按钮把输入逐字敲进真实 shell；演讲者视图里点按钮，会在放映窗口执行)：
1. `uname -a`：内核是 Linux 7.3，机器架构是 aarch64。这是页面里运行的 unkernel：Linux 内核本身编译成 WebAssembly，用户程序是原版 aarch64 (arm64) 二进制，由链接进内核的 aarch64 CPU (kwemu) 执行，热点代码再由 JIT 编译成 WebAssembly；整台机器都在浏览器里，没有远端服务器
2. `cat /etc/os-release`：完整的 Alpine Linux 3.24，后面用到的 zsh、tmux、htop、nvim 都是 apk 装好的原版软件包
3. `htop`：4 个 CPU (Chrome、Edge；Firefox、Safari 里是 1 个)、约 470 MiB 内存，进程列表里是 init、`kwbox tty serve` (kwtty) 和每个页面终端的 zsh，都跑在这个浏览器 Tab 里；按 `q` 退出。刷新页面就是一台新开机的机器
4. `echo hello`：最普通的一次输入、执行、输出
5. `showkey -a`，再依次输入 `a`、`↑`、`Enter`：看到 `97`、`27 91 65`、`13`。到了程序这一层只剩字节：方向键是转义序列 `ESC [ A`，Enter 是 `\r`。showkey 运行时把 TTY 切到 raw 模式 (`cfmakeraw`)，关掉了行缓冲、回显、信号和 icrnl，所以 Enter 原样是 13；平时 TTY 会把它转成 `\n` (10)
6. `Ctrl-D` 退出：raw 模式下 TTY 不处理 ^D，它只是一个字节 4，由 showkey 自己认出来后退出。平时在提示符或 cat 里按 ^D 结束输入，是 TTY 规范模式下的 `eof` 字符，后面 stty 那几页会讲
- 来源：[busybox showkey.c · cfmakeraw 与 CTRL-D](https://git.busybox.net/busybox/tree/console-tools/showkey.c)
-->
