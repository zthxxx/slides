[ANSI 转义序列](https://en.wikipedia.org/wiki/ANSI_escape_code#Fe_Escape_sequences)：控制终端的字节

<div class="ansi-vocab w-full flex gap-10 items-start mt-6">
<div class="flex-1">

| 名称 | 全称 | 字节 |
| --- | --- | --- |
| [ESC](https://en.wikipedia.org/wiki/ANSI_escape_code#C0_control_codes) | Escape | `0x1B` |
| [CSI](https://en.wikipedia.org/wiki/ANSI_escape_code#Control_Sequence_Introducer_commands) | Control Sequence Introducer | `ESC [` |
| [OSC](https://en.wikipedia.org/wiki/ANSI_escape_code#Operating_System_Command_sequences) | Operating System Command | `ESC ]` |
| [ST](https://en.wikipedia.org/wiki/ANSI_escape_code#Fe_Escape_sequences) | String Terminator | `ESC \` |
| [BEL](https://en.wikipedia.org/wiki/ANSI_escape_code#C0_control_codes) | Bell | `0x07` |

</div>
<div class="flex-1">

```bash
# ESC 的几种写法：$'\e' $'\033' $'\x1b' $'\u001b'
ESC=$'\x1b'
CSI="${ESC}["
OSC="${ESC}]"
ST="${ESC}\\"

# CSI 参数… 结尾字母
echo "${CSI}35;1m"
# OSC 编号;参数… ST (或 BEL)
echo "${OSC}11;?${ST}"
```

</div>
</div>

<style>
.ansi-vocab table { font-size: 24px; }
.ansi-vocab pre { font-size: 22px; line-height: 1.5; }
</style>

<!--
- ESC 是一个字节 0x1B，`\e`、`\033`、`\x1b`、`\u001b` 都是它在 `$'…'` 里的写法；双引号里的 `"\e"` 只是反斜杠和字母 e 两个字符，交给 zsh 的 `echo` 才变成 ESC：它自己解释 `\e`、`\a`、`\n`、`\0NNN`、`\xNN`，bash 的 `echo` 要加 `-e` 才行
- CSI 是 `ESC [`，后面跟分号分隔的数字参数和一个结尾字母，结尾字母决定功能：A 到 D 移动光标，m 设置颜色和字体样式
- OSC 是 `ESC ]`，后面是编号和参数，以 ST (`ESC \`) 或 BEL (0x07) 结束；用来设置窗口标题、查询终端颜色等，后面 OSC 那几页展开
- 演示里的命令都先声明 ESC、CSI、OSC、ST 这几个变量，再用它们拼序列，读起来比一串 `\e[` 清楚
- 参考实现：https://github.com/enquirer/enquirer/blob/master/lib/ansi.js
-->

---

最常用的 [CSI](https://en.wikipedia.org/wiki/ANSI_escape_code#Control_Sequence_Introducer_commands) 序列

<div class="csi-columns w-full grid grid-cols-2 gap-10 items-start mt-6">
<div>

[Cursor 光标](https://en.wikipedia.org/wiki/ANSI_escape_code#Control_Sequence_Introducer_commands)

```bash
${CSI}nA      # 上移 n 行   Cursor Up
${CSI}nB      # 下移 n 行   Cursor Down
${CSI}nC      # 右移 n 列   Cursor Forward
${CSI}nD      # 左移 n 列   Cursor Back
${CSI}r;cH    # 移到第 r 行第 c 列
${CSI}2J      # 清屏
${CSI}K       # 清除到行尾
```

</div>
<div>

[SGR Colors 颜色与样式](https://en.wikipedia.org/wiki/ANSI_escape_code#Select_Graphic_Rendition_parameters)

```bash
${CSI}0m            # 重置
${CSI}1m            # 粗体  4 下划线  7 反色
${CSI}31m           # 前景色 30–37
${CSI}42m           # 背景色 40–47
${CSI}38;5;nm       # 256 色前景
${CSI}38;2;r;g;bm   # 24 位真彩前景
${CSI}35;1m         # 参数组合：紫色粗体
```

</div>
</div>

<style>
.csi-columns p { font-size: 26px; text-align: center; margin-bottom: 0.5rem; }
.csi-columns pre { font-size: 21px; line-height: 1.55; }
</style>

<!--
- 光标移动和颜色是 CSI 最常用的两类，结尾字母区分功能：A、B、C、D 是上、下、右、左，H 是定位，J、K 是清除，m 是 SGR
- 前面演示的 `${CSI}5D` 就是左移 5 格，覆盖写出 `Hello *****`
- SGR 的参数可以用分号组合：30–37 前景色，40–47 背景色，1 粗体，0 重置；所以 `35;1` 是紫色粗体。256 色和真彩色用 38、48 加子参数
- 同一套编码是双向的：方向键本身也发出 `ESC [ A` 这类序列，就是开头 showkey 看到的 27 91 65
- 全屏程序 (vim、less、htop) 就是用这些序列在整屏上任意位置画字
-->

---

在另一个终端里移动光标、写字、擦除

<ShellDemo terminals="a b" heights="3 2">
  <ShellStep to="a" run="clear; sleep 600" />
  <ShellStep to="b" run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["
echo -n "${CSI}4;8H" > /dev/pts/{a.pts}' />
  <ShellStep to="b" run='echo -n "Hello, Terminal" > /dev/pts/{a.pts}' />
  <ShellStep to="b" run='echo -n "${CSI}8D" > /dev/pts/{a.pts}' />
  <ShellStep to="b" run='echo -n "World" > /dev/pts/{a.pts}' />
  <ShellStep to="b" run='echo -n "${CSI}K" > /dev/pts/{a.pts}' />
  <ShellStep to="b" run='echo -n "${CSI}2B${CSI}12D(down 2, left 12)" > /dev/pts/{a.pts}' />
  <ShellStep to="b" run="echo -n '\a' > /dev/pts/{a.pts}" />
  <ShellStep to="b" run='echo -n "${CSI}2J${CSI}H" > /dev/pts/{a.pts}' />
  <ShellStep to="a" keys="^C" />
</ShellDemo>

<!--
- A 清屏后跑一个 `sleep 600`，屏幕上什么都不输出，只剩光标；接下来 A 屏幕上的变化全部来自 B 写进 A 的 pts 的字节，A 里的程序一个字节都没写
- B 声明 ESC、CSI 后发 `${CSI}4;8H`：A 的光标跳到第 4 行第 8 列
- 写 `Hello, Terminal`：字从光标处开始，光标停在末尾；这一页用 `echo -n` 去掉结尾的换行，否则 A 的光标会跳到下一行行首
- `${CSI}8D` 左移 8 格停在 T 上，再写 `World`：覆盖成 `Hello, Worldnal`。终端只是在格子里改字，没有「插入」的概念
- `${CSI}K` 擦掉光标到行尾：剩下 `Hello, World`
- `${CSI}2B${CSI}12D` 下移 2 行、左移 12 列，回到第 8 列再写一段：相对移动和绝对定位可以组合
- `echo -n '\a'` 发一个 BEL (0x07)：终端模拟器响一声，标题栏出现铃铛图标，过几秒消失，和 iTerm2、Ghostty 的提示方式一样
- `${CSI}2J${CSI}H` 清屏并把光标放回左上角；最后 A 按 `Ctrl-C` 结束 sleep，zsh 在左上角重新画提示符
- 来源：[ANSI escape code · CSI 序列](https://en.wikipedia.org/wiki/ANSI_escape_code#Control_Sequence_Introducer_commands)、[XTerm Control Sequences · BEL](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Single-character-functions)
-->

---

用 SGR 给文字加粗、上色

<ShellDemo>
  <ShellStep run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["
echo "\n${CSI}1mbold${CSI}0m ${CSI}2mdim${CSI}0m ${CSI}3mitalic${CSI}0m ${CSI}4munderline${CSI}0m ${CSI}7mreverse${CSI}0m"' />
  <ShellStep run='echo "\n${CSI}31mred ${CSI}32mgreen ${CSI}33myellow ${CSI}34mblue${CSI}0m ${CSI}30;46m black on cyan ${CSI}0m"' />
  <ShellStep run='echo "\n${CSI}1;35mbold purple${CSI}0m ${CSI}4;32munderlined green${CSI}0m ${CSI}1;37;41m ERROR ${CSI}0m"' />
  <ShellStep run='echo; for i in {16..51}; do echo -n "${CSI}48;5;${i}m "; done; echo "${CSI}0m"' />
  <ShellStep run='echo; for i in {0..47}; do echo -n "${CSI}48;2;$((i*5));80;$((255-i*5))m "; done; echo "${CSI}0m"' />
</ShellDemo>

<!--
- 第一步声明 ESC、CSI，再逐个试样式：1 粗体、2 暗淡、3 斜体、4 下划线、7 反色，每段后面用 `0m` 重置
- 30–37 是前景色，40–47 是背景色；`30;46` 一次设两个参数：黑字青底
- 参数可以叠加：`1;35` 粗体紫色，`4;32` 下划线绿色，`1;37;41` 白色粗体红底，常见的 ERROR 标签就是这么来的
- `48;5;N` 选 256 色表里的第 N 色作背景，这里画 16 到 51 号；`48;2;R;G;B` 直接给 24 位真彩色，循环里改 R 和 B 得到一条渐变
- 颜色最终长什么样由终端模拟器的调色板决定：同样的 `31m`，在深色和浅色主题下是两种红；点标题栏的主题按钮再看一次就能对比
- 来源：[ANSI escape code · SGR](https://en.wikipedia.org/wiki/ANSI_escape_code#Select_Graphic_Rendition_parameters)
-->

---

可以发送快捷键给另一个终端吗？

<!--
- 问题：既然 `printf ok > /dev/pts/0` 能往 A 的屏幕上写字，那往里写一个 `^C`，能中断 A 上正在跑的程序吗？
- 请大家猜一猜，下一页演示
-->

---

往 A 的 pts 写一个 ^C

<ShellDemo terminals="a b" heights="3 2">
  <ShellStep to="a" run="sleep 100" />
  <ShellStep to="b" run="echo -n '\003' > /dev/pts/{a.pts}" />
  <ShellStep to="b" run="stty -F /dev/pts/{a.pts} -a | grep icanon" />
  <ShellStep to="a" keys="^C" />
  <ShellStep to="b" run="stty -F /dev/pts/{a.pts} -a | grep icanon" />
</ShellDemo>

<!--
- 答案：不能

演示：
1. A `sleep 100`，B `echo -n '\003' > /dev/pts/<A>`：什么都没发生，sleep 继续运行。写 slave 走的是输出方向，字节交给终端模拟器去显示；^C 只有在输入方向上经过开启了 isig 的 line discipline，才会变成 SIGINT。前面 `printf ok` 回车不执行也是这个原因：写进 pts 的字节走输出方向，没有进 A 的输入缓冲
2. B `stty -F /dev/pts/<A> -a | grep icanon`：sleep 在前台时是 `isig icanon echo`，规范模式
3. A 按 `Ctrl-C` 结束 sleep，B 再查一次：回到提示符后变成 `-icanon -echo`，zsh 的行编辑器关掉了 tty 的行缓冲和回显，自己逐键处理 (isig 留着，Ctrl-C 仍由 TTY 转成信号)，印证前面「没有回车前的输入也传给了 shell」
-->

---

部分快捷键是 TTY 特性，[ANSI](https://en.wikipedia.org/wiki/ANSI_escape_code) 是 **终端** 特性，剩的再是 Shell 处理

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
- 页面上是 macOS 的输出；下一页解释其中的关键词，再下一页在 Linux 里动手改这些开关
-->

---

[`stty -a`](https://man7.org/linux/man-pages/man3/termios.3.html) 里的关键词

<div class="stty-glossary w-full grid gap-6 items-start mt-4" style="grid-template-columns: 1fr 1.2fr">
<div>

| 开关 (`-` 前缀表示关闭) | 打开时 |
| --- | --- |
| `isig` | intr、quit、susp 字符变成信号 |
| `icanon` | 规范模式：按行缓冲，回车才交给程序 |
| `echo` | 回显输入的字符 |
| `echoe` · `echoctl` | 退格擦掉字符 · 控制字符显示成 `^C` |
| `iexten` | 启用 lnext、werase 等扩展字符 |
| `tostop` | 后台进程写 tty 也收到 SIGTTOU |
| `icrnl` | 输入的 CR (`\r`) 转成 NL (`\n`) |
| `ixon` | 启用 stop / start 流控 |
| `iutf8` | 退格按 UTF-8 字符删除 |
| `opost` · `onlcr` | 启用输出处理 · 输出的 NL 转成 CR NL |

</div>
<div>

| 特殊字符 | 默认 | 作用 |
| --- | --- | --- |
| `intr` · `quit` | `^C` · `^\` | 发 SIGINT · SIGQUIT |
| `susp` | `^Z` | 发 SIGTSTP，暂停前台任务 |
| `eof` | `^D` | 行首按下时 read 返回 0，即文件结束 |
| `erase` | `^?` | 删除前一个字符 (Backspace) |
| `werase` · `kill` | `^W` · `^U` | 删除前一个单词 · 删除整行 |
| `lnext` | `^V` | 下一个字符按字面输入 |
| `stop` · `start` | `^S` · `^Q` | 暂停 · 恢复输出 |
| `min` · `time` | `1` · `0` | 非规范模式下 read 至少等几个字节 · 等待上限 (0.1 s) |
| `rows` · `columns` | | 窗口大小，变化时发 SIGWINCH |

</div>
</div>

<style>
.stty-glossary table { font-size: 19px; line-height: 1.35; }
.stty-glossary th, .stty-glossary td { padding: 0.35rem 0.6rem; }
.stty-glossary td:not(:last-child) { white-space: nowrap; }
</style>

<!--
- 左边是 termios 的模式开关：lflags 管行规程 (isig、icanon、echo 系列、iexten、tostop)，iflags 管输入转换 (icrnl、ixon、iutf8)，oflags 管输出转换 (opost、onlcr)
- isig、icanon、echo 是后面演示要动的三个开关：关掉 echo 就看不到输入，关掉 icanon 每个字节立刻交给程序，isig 决定 ^C 是否变成信号
- icrnl 和 onlcr 解释了开头 showkey 的现象：Enter 发出的是 `\r` (13)，TTY 转成 `\n` 交给程序；程序输出 `\n` 时 TTY 补成 `\r\n`，光标才回到行首
- 右边是特殊字符映射，都只在对应开关打开时生效：intr、quit、susp 要 isig，erase、kill、eof 要 icanon，werase 要 icanon 加 iexten，lnext 要 iexten，stop、start 要 ixon
- min 和 time 只在非规范模式下有意义：程序 read 时至少等 min 个字节，或者等 time 个 0.1 秒
- 来源：[termios(3)](https://man7.org/linux/man-pages/man3/termios.3.html)、[stty(1)](https://man7.org/linux/man-pages/man1/stty.1.html)
-->

---

动手改 TTY 开关：回显、规范模式、备用屏幕

<ShellDemo>
  <ShellStep run="stty -a" />
  <ShellStep run='read input; echo "you typed: $input"' />
  <ShellStep run="this is secret" />
  <ShellStep run='stty -echo; read input; stty echo; echo "you typed: $input"' />
  <ShellStep run="this is secret" />
  <ShellStep run="stty -icanon; cat" />
  <ShellStep type="a" />
  <ShellStep type="b" />
  <ShellStep keys="^C" run="stty icanon" />
  <ShellStep run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["
echo "${CSI}?1049h${CSI}H"; echo "alternate screen, like vim / less"' />
  <ShellStep run='echo "${CSI}?1049l"' />
</ShellDemo>

<!--
- 直观看 line discipline 的几个开关

演示：
1. `stty -a`：Linux 下的完整配置，和上一页 macOS 的输出对照
2. `read input` 后输入 `secret`：输入时正常回显
3. `stty -echo` 后再 `read`：屏幕上看不到输入，但程序照样读到了。输入密码就是这样实现的，回显是 TTY 的功能
4. `stty -icanon; cat` 后依次输入 `a`、`b`：显示 `aabb`。关掉规范模式后不再按行缓冲，每个字符一到就交给 cat：`a` 先由 TTY 回显一次，cat 读到后再输出一次，`b` 也一样；`Ctrl-C` 退出后 `stty icanon` 恢复
5. 声明 ESC、CSI 后，`${CSI}?1049h` 切到备用屏幕 (`${CSI}H` 把光标移到左上角) 并写一行字，zsh 的提示符也画在备用屏幕里；停在这里讲一讲，再点下一步 `${CSI}?1049l` 切回，原来的内容原样恢复。旧写法是 `?47h` / `?47l`
6. 全屏程序 (htop、vim、less) 都是这样进出备用屏幕的，退出后屏幕复原；后面 TUI 那页实际运行 nvim 和 less
-->
