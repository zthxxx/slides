---
theme: eloc
routerMode: hash
---

## CLI 概览 (其一)

Terminal / 输入输出

<!--
- 本系列想把每天都在用、却说不清的几个概念讲明白：Terminal、TTY、Shell，以及它们和进程怎么协作。
- 「其一」只讲输入输出：一个按键从键盘到屏幕走过的完整路径。
- 演示用的是页面里直接运行的真实 Linux 内核（unkernel，Alpine riscv64，shell 是 busybox ash），会后每个人打开这个页面都能自己重做一遍。
-->

---

本栏目可能含有以下场景

**思维跳跃**　　**越偏越远**

**概念无数**　　**手忙脚乱**

<!--
- 先打个预防针：名词很多（console、tty、pty、ptmx、pts、shell），话题也会经常跳。
- 今天的目标是建立直觉和整体图景，不用逐个背定义；一时没跟上没关系，结尾有参考资料。
-->

---

[在浏览器地址栏输入URL到页面展示，背后发生了什么？](https://www.zhihu.com/question/34873227)

<!--
- 经典面试题：从输入 URL 到页面展示，要经过 DNS、TCP、TLS、HTTP、渲染，每一层都能无限展开。
- 我们今天也走一遍类似的「全链路」，但范围缩小到终端。
-->

---

简化亿点

*在地址栏敲下第一个按键到显示出字母发生了什么*

<!--
- 再缩小一点：只看敲下第一个按键，到屏幕上显示出这个字母。
- 就这一个字母，也要经过键盘中断、操作系统输入事件、浏览器输入框、重绘好几层。
- 接下来把场景换成终端。
-->

---

在**终端**里敲下按键到显示出字母发生了什么

<ShellDemo>
  <ShellStep run="echo hello" />
  <ShellStep run="showkey -a" />
  <ShellStep type="a" />
  <ShellStep keys="↑ ⏎" />
  <ShellStep keys="^D" />
</ShellDemo>

<!--
- 问题：在终端里按下一个键，屏幕上出现这个字母，中间都经过了谁？
- 先给轮廓，后面逐层展开：终端模拟器把按键编码成字节，写进 ptmx，经过内核 TTY 的 line discipline 交给 shell；shell 或 TTY 再把字节写回，由终端模拟器解析并渲染。
- 反直觉的一点：屏幕上的字母不是键盘直接「画」上去的，而是回显（echo）回来的输出。

演示（右侧按钮把输入逐字敲进真实 shell；演讲者视图里点按钮，会在放映窗口执行）：
1. `echo hello`：最普通的一次输入、执行、输出。
2. `showkey -a`，再依次输入 `a`、`↑`、`Enter`：看到 `97`、`27 91 65`、`13`。到了程序这一层只剩字节：方向键是转义序列 `ESC [ A`，Enter 是 `\r`（平时被 TTY 的 icrnl 转成 `\n`）。
3. `Ctrl-D` 退出：它对应 stty 里的 `eof = ^D`，后面会讲谁在处理它。

```sh
# A
echo hello
showkey -a      # 依次按 a、↑、Enter
# A: 按 Ctrl-D 退出
```
-->

---

终端 (Terminal) 是什么

<!--
- 日常说的「终端」混了好几层：硬件、内核里的 TTY 子系统、终端模拟器 App，以及在里面跑的 shell。
- 先认识这些名词，再借历史理清它们为什么叫这些名字。
-->

---

`Console` (控制台), `TTY` (Teletypewriter)

`Terminal` (终端), `CLI` (命令行界面), `Shell`

`PTMX` (pseudo-terminal master), `PTS` (pseudo-terminal slave)

`PTY` (pseudo terminal device)

<!--
- Console（控制台）：与主机一体的特殊终端，给系统管理员用，也是系统级消息输出的地方。
- TTY：Teletypewriter 的缩写，后来既指内核里的终端子系统，也成了「终端」的统称。
- Terminal 是输入输出环境；CLI 是用文本交互的界面形态；Shell 是命令解释器，提示符、行编辑、历史记录都属于 shell。
- PTY 由 PTMX（master）和 PTS（slave）成对组成：master 端交给终端模拟器或 sshd，slave 端交给 shell。
-->

---

### 终端的历史

<!--
- 这些名字都来自硬件时代；理解了历史，就能理解为什么今天的内核里还有 TTY。
-->

---

![ENIAC-console-panel](/images/ENIAC-console-panel.jpg)

早期的电子管电脑，有一堆按钮组成的控制台 (`Console`)

<style>
  p {
    @apply w-full flex justify-center items-center;

    img {
      @apply max-w-1/2;
    }
  }
</style>

<!--
- 早期电子管计算机的控制台就是一面按钮和指示灯，操作员直接拨开关、看灯。
- Console 这个词就是从这里来的：与主机一体，并且只有一个。
-->

---

![Teletype](/images/Teletype.jpg)

后来有了键盘，可以输入，打字在纸上 (`Teletype`)

<style>
  p {
    @apply w-full flex justify-center items-center;

    img {
      @apply max-w-1/2;
    }
  }
</style>

<!--
- 电传打字机本来用来收发电报：按键发出信号，收到的信号打印在纸带上。
- Unix 要支持多用户，选了便宜的 ASR-33 当终端，所以内核里的终端设备至今叫 tty。
- 当时的链路：终端 → Modem → 线路 → UART → 计算机；内核 TTY 子系统由 UART driver、line discipline、TTY driver 三层组成。
-->

---

![DECVT100-terminal](/images/DECVT100-terminal.jpg)

再往后有了显示器，和键盘一起组成多用户输入输出 `Terminal`，系统级别才显示到 `Console`

<style>
  p {
    @apply w-full;

    img {
      @apply max-w-1/2 mx-auto;
    }
  }
</style>

<!--
- 后来有了显示器：DEC VT100（1978）支持 ANSI 转义序列、可以定位光标，成了「智能终端」的事实标准。
- 每个用户各用一台终端接入主机，系统级消息仍然只输出到 Console。
- 今天的终端模拟器大多还在模拟 VT100 / xterm，`$TERM` 声明的就是模拟哪一种。
-->

---

来到主机时代图形界面，没有这样的物理设备了，

<!--
- 到了 PC 时代，键盘和显示器直接接在主机上，物理终端消失了，但内核的 TTY 架构完整保留了下来。
- 用户空间程序不需要任何改动，读写的依旧是一个 tty 设备文件。
-->

---

- 终端的概念变成了现在的虚拟终端，放在内核中
  <br/>
  <small>(`Virtual Console` / `Terminal Emulator`)</small>
  <br/>
  <br/>
- 内核管理终端输入输出的部分统称 TTY
  <br/>
  <small>(`teletype` / `Teletypewriter`)</small>
  <br/>
  <br/>
- 接入到 TTY 的给用户用的 App 统称终端
  <br/>
  <small>(`Terminal`)</small>

<!--
- Virtual Console：Linux 上 Ctrl+Alt+F1~F6 切出的全屏字符界面，由内核直接提供，对应 /dev/tty1~6；图形界面崩了还能用它救火。
- Terminal Emulator：图形界面里的终端窗口，比如 iTerm2、gnome-terminal，或者这个页面里的 xterm.js，它们通过 PTY 接入内核。
- 内核里管理终端输入输出的部分统称 TTY；接入 TTY、给用户用的 App 统称终端。
-->

---

例如这样一个 Terminal

<ShellDemo>
  <ShellStep run="tty" />
  <ShellStep run="echo $TERM" />
  <ShellStep run="ls -l /proc/$$/fd" />
  <ShellStep run="ls /dev/pts/" />
</ShellDemo>

<!--
- 这个页面里的终端有两部分：xterm.js 负责渲染（终端模拟器），页面里运行的 Linux 内核提供 PTY 和 shell。
- 在内核眼里它就是一个 PTY：shell 的 0、1、2 三个 fd 都指向一个 pts 设备。

演示：
1. `tty`：当前 shell 标准输入连接的终端设备，`/dev/pts/N`。
2. `echo $TERM`：`xterm-256color`，程序靠终端类型决定用哪套转义序列。
3. `ls -l /proc/$$/fd`：fd 0、1、2 都指向这个 pts，shell 的 stdin、stdout、stderr 就是这个 tty；多出来的 `10 -> /dev/tty` 是 ash 为作业控制打开的。
4. `ls /dev/pts/`：每打开一个伪终端就多一个编号（上一页的终端也还在），另外还有 `ptmx`。

```sh
# A
tty
echo $TERM
ls -l /proc/$$/fd
ls /dev/pts/
```
-->

---

TTY 负责控制字符的输入输出

```
                      +----------------+
                      |   TTY Driver   |
                      |      I/O       |
                      |   +-------+    |       +----------------+
 +------------+       |   |       |<---------->| User process A |
 | Terminal A |<--------->| tty/0 |    |       +----------------+
 +------------+       |   |       |<---------->| User process B |
                      |   +-------+    |       +----------------+
                      |                |
                      |   +-------+    |       +----------------+
 +------------+       |   |       |<---------->| User process C |
 | Terminal B |<--------->| tty/1 |    |       +----------------+
 +------------+       |   |       |<---------->| User process D |
                      |   +-------+    |       +----------------+
                      |                |
                      +----------------+
```

<style>
  pre {
    --slidev-code-line-height: 1.2;
  }
</style>

<!--
- TTY 可以看作一根带处理逻辑的双向管道，一端接终端，一端接进程。
- 中间的 line discipline 负责：回显（echo）；行缓冲与行编辑（icanon，比如退格、Ctrl-U）；把特殊字符转成信号（isig，比如 Ctrl-C 转成 SIGINT）；换行转换（icrnl、onlcr）。
- 一个 tty 上可以挂多个进程，但输入只交给前台进程组。
-->

---


```
   Input    +--------------------------+    R/W     +------+
----------->|                          |<---------->| bash |
            |          tty/0           |  actived   +------+
<-----------|                          |            +------+
   Output   | Foreground process group |<-----------| fish |
            +--------------------------+     W      +------+
```

<style>
  pre {
    --slidev-code-line-height: 1.2;
  }
</style>

<!--
- 一个 tty 同一时刻只有一个前台进程组，它既能读也能写，对应图中的 bash（R/W）。
- 后台进程组默认（-tostop）仍然可以写 tty；但它一读 tty 就会收到 SIGTTIN 被暂停，对应图中只有 W 的 fish。
- shell 每启动一个前台任务，就把 tty 的前台进程组切到这个任务，任务结束后再切回自己。
-->

---

```bash
# 前端进程
for i in $(seq 1 10); do
  echo $i
  sleep 1
done

# 非前端进程
(
  for i in $(seq 1 10); do
    echo $i
    sleep 1
  done
)&
```

<!--
- 同一段循环，一个直接在前台跑，一个加上括号和 `&` 放到后台跑。
- 先让大家预测：两种情况下按 Ctrl-C 有什么区别？在循环运行时打字会发生什么？
- 演示环境是 busybox ash，不支持 `{1..10}` 花括号展开，所以用 `$(seq 1 10)`。
-->

---

<ShellDemo terminals="a b">
  <ShellStep to="a" run="for i in $(seq 1 10); do echo $i; sleep 1; done" />
  <ShellStep to="a" keys="^C" />
  <ShellStep to="a" run="(for i in $(seq 1 10); do echo $i; sleep 1; done) &" />
  <ShellStep to="a" keys="^C" />
  <ShellStep to="a" run="jobs" />
  <ShellStep to="a" run="read x &" />
  <ShellStep to="a" run="jobs" />
  <ShellStep to="b" run="ps -o pid,ppid,pgid,tty,stat,args | grep -v ' ? '" />
</ShellDemo>

<!--
- 前台和后台的区别不在于谁能输出，而在于谁能读取输入、谁会收到 Ctrl-C。

演示：
1. A 跑前台循环，每秒输出一个数字；期间在 A 里随手打几个字：字符被回显但不执行，TTY 先缓冲着，等循环结束才交给 shell。
2. A 按 `Ctrl-C`：line discipline 把 ^C 转成 SIGINT 发给前台进程组，循环中止。
3. A 跑后台循环：提示符立刻返回，数字照样打印，说明后台进程可以写 tty。
4. 再按 `Ctrl-C`：只换了一行新提示符，后台循环不受影响。
5. `jobs`：后台作业状态为 Running。
6. `read x &` 再 `jobs`：显示 `Stopped (tty input)`，后台进程组去读 tty 收到 SIGTTIN 被暂停，对应前面图里只有 W 的 fish。
7. B 执行 `ps`：PGID 列就是进程组；TT 列的 `136,N` 是 pts 的主、次设备号（busybox ps 不显示设备名）。

```sh
# A
for i in $(seq 1 10); do echo $i; sleep 1; done
# A: 按 Ctrl-C
(for i in $(seq 1 10); do echo $i; sleep 1; done) &
# A: 按 Ctrl-C
jobs
read x &
jobs
# B
ps -o pid,ppid,pgid,tty,stat,args | grep -v ' ? '
```
-->

---

ssh & pts

```
+------------+              +------------+
|            |              |            |
|  Terminal  |------------->| ssh server |--------------------------+
|            | ssh protocol |            |           fork           |
+------------+              +------------+                          |
                                |   ↑                               |
                                |   |                               |
                          write |   | read                          |
                                |   |                               |
                          +-----|---|-------------------+           |
                          |     |   |                   |           ↓
                          |     ↓   |      +-------+    |       +-------+
PTMX                      |   +--------+   | pts/0 |<---------->| shell |
(pseudo-terminal master)  |   |        |   +-------+    |       +-------+
                          |   |  ptmx  |<->| pts/1 |<---------->| shell |
PTS                       |   |        |   +-------+    |       +-------+
(pseudo-terminal slave)   |   +--------+   | pts/2 |<---------->| shell |
                          |                +-------+    |       +-------+
                          |    Kernel                   |
                          +-----------------------------+
```

<style>
  pre {
    --slidev-code-line-height: 1.2;
  }
</style>

<!--
- ssh 登录时，sshd 认证通过后调用 `posix_openpt()` 打开 /dev/ptmx 拿到 master fd，内核同时创建 slave 设备 /dev/pts/N。
- sshd fork 出 shell，把 shell 的 0、1、2 绑到 pts/N；之后 sshd 在 ssh 协议和 ptmx fd 之间来回搬运字节。
- 终端模拟器（iTerm2，或这个页面里的 xterm.js）做的是同一件事，只是不经过网络；tmux 也一样，tmux server 持有 ptmx，为每个窗格创建一个 pts。
- 连接断开时 master 被关闭，内核会给这个会话发 SIGHUP。
-->

---

- `/dev/console` 系统唯一控制台，系统级别显示(启动/关闭系统时)

- `/dev/ttyN` 系统直连终端每次会被分配到一个新的 tty

- `/dev/tty` 对每个终端独立，等价于自己的 tty

- `/dev/pts/N` ssh 等外部连接会被分配到的 tty

- `/proc/N/fd/N` 进程打开的文件描述符

- `/proc/self/fd/` 当前进程打开的文件描述符

<!--
- /dev/console：系统唯一的控制台，内核启动和关机时的消息都输出到这里。
- /dev/ttyN 是虚拟控制台；/dev/tty 是个特殊文件，永远指向当前进程自己的控制终端。
- /dev/pts/N 是 PTY 的 slave 端，由 ssh、终端模拟器、tmux 分配。
- /proc/N/fd/ 列出进程 N 打开的 fd；/proc/self 指正在读取它的进程自己。
- 本演示环境的 console 是 /dev/hvc0（虚拟化控制台），没有 /dev/ttyN，页面上的终端都是 /dev/pts/N。
-->

---

<ShellDemo terminals="a b">
  <ShellStep to="a" run="tty" />
  <ShellStep to="b" run="tty" />
  <ShellStep to="b" run="lsof | grep /dev/pts/{a.pts}" />
  <ShellStep to="b" run="ls -l /proc/{a.pid}/fd" />
  <ShellStep to="b" run="echo ok > /dev/pts/{a.pts}" />
  <ShellStep to="a" run="exec 6<> ./testfd.txt" />
  <ShellStep to="a" run="ls -l /proc/$$/fd" />
  <ShellStep to="b" run="lsof | grep testfd" />
  <ShellStep to="b" run='echo -e "\e[35;1mTitle of the Program\e[0m" > /dev/pts/{a.pts}' />
  <ShellStep to="a" run="printf 'Hello World\e[5D*****\n'" />
  <ShellStep to="b" run="stty -F /dev/pts/{a.pts} -a | grep icanon" />
</ShellDemo>

<!--
- 用两个终端验证一件事：tty 就是一个文件，谁有权限，谁就能往里写。
- 按钮里的 pts 编号和 pid 在点击时按 A 的实际值填入。

演示：
1. A、B 各执行 `tty`：同一台机器上的两个 PTY。
2. B `lsof | grep /dev/pts/<A>`：A 的 shell 的 0、1、2 都打开着 A 的 pts。
3. B `ls -l /proc/<A 的 shell pid>/fd`：从 /proc 看到同样的结果。
4. B `echo ok > /dev/pts/<A>`：ok 出现在 A 的屏幕上；写 pts 就是往 A 的输出方向写，A 的 shell 毫不知情。
5. A `exec 6<> ./testfd.txt` 再 `ls -l /proc/$$/fd`：shell 多出 fd 6；B `lsof | grep testfd` 也能看到。fd 只是进程打开文件的编号，0、1、2 只是约定。
6. B 往 A 写 `\e[35;1m...`：A 上出现紫色粗体字。颜色是终端模拟器解析 ANSI 序列的结果，与 shell 无关。
7. A `printf 'Hello World\e[5D*****\n'`：光标左移 5 格后覆盖写入，显示 `Hello *****`。
8. B `stty -F /dev/pts/<A> -a | grep icanon`：A 停在提示符时是 `-isig -icanon -echo`，为下一页做铺垫。

```sh
# A
tty
# B
tty
lsof | grep /dev/pts/0                # 0 换成 A 的 pts 编号
ls -l /proc/<A 的 shell pid>/fd
echo ok > /dev/pts/0
# A
exec 6<> ./testfd.txt
ls -l /proc/$$/fd
# B
lsof | grep testfd
echo -e "\e[35;1mTitle of the Program\e[0m" > /dev/pts/0
# A
printf 'Hello World\e[5D*****\n'
# B
stty -F /dev/pts/0 -a | grep icanon
```
-->

---


输入但没有回车前的命令也是传给 shell 了，

只是因为没有换行符号，所以 shell 没有立刻解析执行，

因为 shell 在交互模式 (interactive) 下，所以才能控制光标编辑命令

<!--
- 交互模式下，shell 的行编辑器（ash 自带的行编辑、bash 的 readline、zsh 的 zle）把 tty 切到非规范模式（-icanon -echo），每个按键都立刻交给 shell。
- 所以按回车之前字符已经到了 shell；回显、光标移动、退格、补全、历史，都是 shell 自己用 ANSI 序列画出来的。
- 按下回车 shell 才解析并执行；执行前它恢复规范模式，把前台交给这个命令。
- 证据：上一页最后一步，A 停在提示符时 `stty -F` 看到 `-icanon -echo`；后面 ^C 那页会对比 A 跑 sleep 时的 `icanon echo`。
-->

---

<section class="w-full flex justify-around items-start">
  <div class="flex flex-col items-center">

  [ANSI](https://en.wikipedia.org/wiki/ANSI_escape_code#Terminal_output_sequences)

  ```bash
  ESC="\u001b"
  ESC="\e"
  CSI="${ESC}["

  # Cursor Up        <ESC>[{COUNT}A
  # Cursor Down      <ESC>[{COUNT}B
  # Cursor Right     <ESC>[{COUNT}C
  # Cursor Left      <ESC>[{COUNT}D
  ```

  </div>

  <div class="flex flex-col items-center">

  [SGR Colors](https://en.wikipedia.org/wiki/ANSI_escape_code#Colors)

  ```bash
  <ESC>[<Front>;<Background>m
  ```

  </div>
</section>

<!--
- ESC 可以写成 `\e`、`\033` 或 0x1b；CSI 是 `ESC [`，后面跟参数和一个结尾字母，结尾字母决定功能。
- 光标移动用 A、B、C、D，分别是上、下、右、左；前面演示的 `\e[5D` 就是左移 5 格。
- SGR 的格式是 `ESC [ 参数 m`：30–37 前景色，40–47 背景色，1 粗体，0 重置；所以 `35;1` 是紫色粗体。
- 同一套编码是双向的：方向键本身也发出 `ESC [ A` 这类序列，就是开头 showkey 看到的 27 91 65。
- 参考实现：https://github.com/enquirer/enquirer/blob/master/lib/ansi.js
-->

---

可以发送快捷键给另一个终端吗？

<!--
- 问题：既然能 `echo ok > /dev/pts/0`，那往里写一个 `^C`，能中断 A 上正在跑的程序吗？
- 先请大家猜一猜，下一页演示。
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
- 答案：不能。

演示：
1. A `sleep 100`，B `printf '\003' > /dev/pts/<A>`：什么都没发生，sleep 继续运行。写 slave 走的是输出方向，字节交给终端模拟器去显示；^C 只有在输入方向上经过开启了 isig 的 line discipline，才会变成 SIGINT。
2. B `stty -F /dev/pts/<A> -a | grep icanon`：sleep 在前台时是 `isig icanon echo`，规范模式。
3. A 按 `Ctrl-C` 结束 sleep，B 再查一次：回到提示符后变成 `-isig -icanon -echo`，交互 shell 的行编辑器把 tty 切成 raw，回显和编辑由它自己完成，印证前面「没有回车前的输入也传给了 shell」。

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
- 按键分三层处理：TTY 的 line discipline 处理 ^C、^Z、^D、回显和基础行编辑；终端模拟器负责按键编码和 ANSI 渲染；shell 负责行编辑、补全和历史。
- `stty -a` 显示 termios 配置：lflags 里的 isig、icanon、echo 是 line discipline 的开关；cchars 里的 intr=^C、susp=^Z、eof=^D 是特殊字符映射，可以改，比如把 intr 改成 ^E。
- stop=^S、start=^Q 用于流控：刷屏时按 ^S 暂停输出，^Q 继续。
- rows、columns 是窗口大小，窗口变化时更新它们并给前台进程发 SIGWINCH。
- 页面上是 macOS 的输出，下一页在 Linux 里动手改这些开关。
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
</ShellDemo>

<!--
- 直观看 line discipline 的几个开关。

演示：
1. `stty -a`：Linux 下的完整配置，和上一页 macOS 的输出对照。
2. `read input` 后输入 `secret`：输入时正常回显。
3. `stty -echo` 后再 `read`：屏幕上看不到输入，但程序照样读到了。输入密码就是这样实现的，回显是 TTY 的功能。
4. `stty -icanon; cat` 后输入 `ab`：显示 `abab`。关掉规范模式后不再按行缓冲，每个字符都立刻交给 cat；`Ctrl-C` 退出后 `stty icanon` 恢复。
5. `\e[?1049h` 切到备用屏幕停 3 秒再 `\e[?1049l` 切回，原来的内容原样恢复；vim、less、top 退出后屏幕能复原靠的就是它。旧写法是 `\e[?47h` / `\e[?47l`。

```sh
# A
stty -a
read input; echo "you typed: $input"                          # 输入 secret 回车
stty -echo; read input; stty echo; echo "you typed: $input"   # 输入 secret 回车
stty -icanon; cat                                             # 输入 ab，然后 Ctrl-C
stty icanon
printf '\e[?1049h\e[H'; echo 'alternate screen, like vim / less'; sleep 3; printf '\e[?1049l'
```
-->

---

\> To Be Continued

<!--
- 这次讲了：终端的历史、TTY 和 PTY 的结构、前台进程组、ANSI 转义序列和 stty。
- 下期预告：session、进程组和控制终端的关系；SIGHUP、nohup，以及 tmux 为什么断线后进程不退出；守护进程怎么脱离终端。
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
- 维基百科四个词条：终端、电传打字机、终端模拟器、ANSI 转义序列。
- 两篇 StackOverflow 讲全屏终端程序和 alternate screen，对应前面备用屏幕的演示。
-->

---

Ref Pictures & Flow:

- https://en.wikipedia.org/wiki/Computer_terminal
- https://segmentfault.com/a/1190000016129862
- https://segmentfault.com/a/1190000009082089

<!--
- printempw《命令行界面 (CLI)、终端 (Terminal)、Shell、TTY，傻傻分不清楚？》：理清概念，讲清终端与 shell 的分工。
- public0821《Linux TTY/PTS 概述》：TTY 子系统、ssh 加 pty 的数据流、stty 配置和 TTY 相关信号；它的续篇讲进程与会话。
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
- 谢谢大家，Q&A。
- 页面里的终端是编译成 WebAssembly 的真实 Linux 内核（unkernel），打开 slides.zthxxx.me 就能自己重做所有演示。
-->
