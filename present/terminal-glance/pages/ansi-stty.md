<section class="w-full flex justify-around items-start">
  <div class="flex flex-col items-center">

  [ANSI](https://en.wikipedia.org/wiki/ANSI_escape_code#Terminal_output_sequences)

  ```bash
  ESC="\u001b"
  ESC="\x1b"
  ESC="\033"
  ESC="\e"

  CSI="${ESC}["
  OSC="${ESC}]"
  ST="${ESC}\\"

  # Cursor Up        <CSI>{COUNT}A
  # Cursor Down      <CSI>{COUNT}B
  # Cursor Right     <CSI>{COUNT}C
  # Cursor Left      <CSI>{COUNT}D
  ```

  </div>

  <div class="flex flex-col items-center">

  [SGR Colors](https://en.wikipedia.org/wiki/ANSI_escape_code#Colors)

  ```bash
  <ESC>[<Front>;<Background>m
  <CSI><Front>;<Background>m
  ```

  </div>
</section>

<!--
- ESC 可以写成 `\e`、`\033` 或 0x1b；CSI 是 `ESC [`，后面跟参数和一个结尾字母，结尾字母决定功能
- 光标移动用 A、B、C、D，分别是上、下、右、左；前面演示的 `\e[5D` 就是左移 5 格
- SGR 的格式是 `ESC [ 参数 m`：30–37 前景色，40–47 背景色，1 粗体，0 重置；所以 `35;1` 是紫色粗体
- 同一套编码是双向的：方向键本身也发出 `ESC [ A` 这类序列，就是开头 showkey 看到的 27 91 65
- 参考实现：https://github.com/enquirer/enquirer/blob/master/lib/ansi.js
-->

---

可以发送快捷键给另一个终端吗？

<!--
- 问题：既然 `printf ok > /dev/pts/0` 能往 A 的屏幕上写字，那往里写一个 `^C`，能中断 A 上正在跑的程序吗？
- 请大家猜一猜，下一页演示
-->

---

<ShellDemo terminals="a b">
  <ShellStep to="a" run="sleep 100" />
  <ShellStep to="b" run="printf '\003' > /dev/pts/{a.pts}" />
  <ShellStep to="b" run="stty -F /dev/pts/{a.pts} -a | grep icanon" />
  <ShellStep to="a" keys="^C" />
  <ShellStep to="b" run="stty -F /dev/pts/{a.pts} -a | grep icanon" />
</ShellDemo>

<!--
- 答案：不能

演示：
1. A `sleep 100`，B `printf '\003' > /dev/pts/<A>`：什么都没发生，sleep 继续运行。写 slave 走的是输出方向，字节交给终端模拟器去显示；^C 只有在输入方向上经过开启了 isig 的 line discipline，才会变成 SIGINT。前面 `printf ok` 回车不执行也是这个原因：写进 pts 的字节走输出方向，没有进 A 的输入缓冲
2. B `stty -F /dev/pts/<A> -a | grep icanon`：sleep 在前台时是 `isig icanon echo`，规范模式
3. A 按 `Ctrl-C` 结束 sleep，B 再查一次：回到提示符后变成 `-icanon -echo`，zsh 的行编辑器关掉了 tty 的行缓冲和回显，自己逐键处理 (isig 留着，Ctrl-C 仍由 TTY 转成信号)，印证前面「没有回车前的输入也传给了 shell」

```sh
# A
sleep 100
# B
printf '\003' > /dev/pts/0
stty -F /dev/pts/0 -a | grep icanon
# A: 按 Ctrl-C
# B
stty -F /dev/pts/0 -a | grep icanon
```
-->

---

部分快捷键是 TTY 特性，[ANSI](https://en.wikipedia.org/wiki/ANSI_escape_code#Terminal_output_sequences) 是 **终端** 特性，剩的再是 Shell 处理

`stty -a`

```bash
speed 38400 baud; 35 rows; 120 columns;
lflags: icanon isig iexten echo echoe echok echoke -echonl echoctl
	-echoprt -altwerase -noflsh -tostop -flusho pendin -nokerninfo
	-extproc
iflags: -istrip icrnl -inlcr -igncr ixon -ixoff ixany imaxbel iutf8
	-ignbrk brkint -inpck -ignpar -parmrk
oflags: opost onlcr -oxtabs -onocr -onlret
cflags: cread cs8 -parenb -parodd hupcl -clocal -cstopb -crtscts -dsrflow
	-dtrflow -mdmbuf
cchars: discard = ^O; dsusp = ^Y; eof = ^D; eol = <undef>;
	eol2 = <undef>; erase = ^?; intr = ^C; kill = ^U; lnext = ^V;
	min = 1; quit = ^\; reprint = ^R; start = ^Q; status = ^T;
	stop = ^S; susp = ^Z; time = 0; werase = ^W;
```

<!--
- 按键分三层处理：TTY 的 line discipline 处理 ^C、^Z、^D、回显和基础行编辑；终端模拟器负责按键编码和 ANSI 渲染；shell 负责行编辑、补全和历史
- `stty -a` 显示 termios 配置：lflags 里的 isig、icanon、echo 是 line discipline 的开关；cchars 里的 intr=^C、susp=^Z、eof=^D 是特殊字符映射，可以改，比如把 intr 改成 ^E
- stop=^S、start=^Q 用于流控：刷屏时按 ^S 暂停输出，^Q 继续
- rows、columns 是窗口大小，窗口变化时更新它们并给前台进程发 SIGWINCH
- 页面上是 macOS 的输出，下一页在 Linux 里动手改这些开关
-->

---

<ShellDemo>
  <ShellStep run="stty -a" />
  <ShellStep run='read input; echo "you typed: $input"' />
  <ShellStep run="secret" />
  <ShellStep run='stty -echo; read input; stty echo; echo "you typed: $input"' />
  <ShellStep run="secret" />
  <ShellStep run="stty -icanon; cat" />
  <ShellStep type="ab" />
  <ShellStep keys="^C" run="stty icanon" />
  <ShellStep run="printf '\e[?1049h\e[H'; echo 'alternate screen, like vim / less'; sleep 3; printf '\e[?1049l'" />
  <ShellStep run="htop" />
  <ShellStep type="q" />
</ShellDemo>

<!--
- 直观看 line discipline 的几个开关

演示：
1. `stty -a`：Linux 下的完整配置，和上一页 macOS 的输出对照
2. `read input` 后输入 `secret`：输入时正常回显
3. `stty -echo` 后再 `read`：屏幕上看不到输入，但程序照样读到了。输入密码就是这样实现的，回显是 TTY 的功能
4. `stty -icanon; cat` 后输入 `ab`：显示 `abab`。关掉规范模式后不再按行缓冲，每个字符都立刻交给 cat；`Ctrl-C` 退出后 `stty icanon` 恢复
5. `\e[?1049h` 切到备用屏幕停 3 秒再 `\e[?1049l` 切回，原来的内容原样恢复；旧写法是 `\e[?47h` / `\e[?47l`
6. `htop`，按 `q` 退出：全屏程序 (htop、vim、less) 都是这样进出备用屏幕的，退出后屏幕复原

```sh
# A
stty -a
read input; echo "you typed: $input"                          # 输入 secret 回车
stty -echo; read input; stty echo; echo "you typed: $input"   # 输入 secret 回车
stty -icanon; cat                                             # 输入 ab，然后 Ctrl-C
stty icanon
printf '\e[?1049h\e[H'; echo 'alternate screen, like vim / less'; sleep 3; printf '\e[?1049l'
htop                                                          # 按 q 退出
```
-->
