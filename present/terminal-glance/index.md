---

## CLI 概览 (其一)

Terminal / 输入输出

---

本栏目可能含有以下场景

**思维跳跃**　　**越偏越远**

**概念无数**　　**手忙脚乱**

---

[在浏览器地址栏输入URL到页面展示，背后发生了什么？](https://www.zhihu.com/question/34873227)

---

简化亿点

*在地址栏敲下第一个按键到显示出字母发生了什么*

---

在**终端**里敲下按键到显示出字母发生了什么

<iframe
  class="terminal"
  src="https://devbox.zthxxx.me/tty/"
>
</iframe>


<style>
.terminal {
  width: 80%;
  height: 360px;
  border-radius: 8px;
  padding: 8px 0 8px 8px;
  background: #272936;
}
</style>


---

终端 (Terminal) 是什么

---

`Console` (控制台), `TTY` (Teletypewriter)

`Terminal` (终端), `CLI` (命令行界面), `Shell`

`PTMX` (pseudo-terminal master), `PTS` (pseudo-terminal slave)

`PTY` (pseudo terminal device)


---

### 终端的历史

---

![ENIAC-console-panel](./images/ENIAC-console-panel.jpg)

早期的电子管电脑，有一堆按钮组成的控制台 (`Console`)

<style>
p {
  display: flex;
  justify-content: center;
}
img {
  width: 60%;
}
</style>

---

![Teletype](./images/Teletype.jpg)

后来有了键盘，可以输入，打字在纸上 (`Teletype`)

<style>
p {
  display: flex;
  justify-content: center;
}
img {
  width: 80%;
  justify-self: center;
}
</style>


---

![DECVT100-terminal](./images/DECVT100-terminal.jpg)

再往后有了显示器，和键盘一起组成多用户输入输出 (`Terminal`), 系统级别才显示到 Console

<style>
p {
  display: flex;
  justify-content: flex-start;
}
img {
  width: 80%;
  justify-self: center;
}
</style>

---

- 来到主机时代图形界面，没有这样的物理设备了，
  
  终端的概念变成了现在的虚拟终端 (`Virtual Console` / `Terminal Emulator`) 放在内核中
  
  内核管理终端输入输出的部分统称 TTY (`teletype` / `Teletypewriter`)

  接入到 TTY 的给用户用的 App 统称终端 (`Terminal`)

---

例如这样一个 Terminal

<iframe
  class="terminal"
  src="https://devbox.zthxxx.me/tty/"
>
</iframe>

<style>
.terminal {
  width: 80%;
  height: 360px;
  border-radius: 8px;
  padding: 8px 0 8px 8px;
  background: #272936;
}
</style>

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


---


```
   Input    +--------------------------+    R/W     +------+
----------->|                          |<---------->| bash |
            |          tty/0           |  actived   +------+
<-----------|                          |            +------+
   Output   | Foreground process group |<-----------| fish |
            +--------------------------+     W      +------+  
```


---

```bash
# 前端进程
for i in {1..10}; do
  echo $i
  sleep 1
done

# 非前端进程
(
  for i in {1..10}; do
  echo $i
  sleep 1
done
)&
```

---

<iframe
  class="terminal"
  src="https://devbox.zthxxx.me/tty/"
>
</iframe>

<br />

<iframe
  class="terminal"
  src="https://devbox.zthxxx.me/tty/"
>
</iframe>

<style>
.terminal {
  width: 80%;
  height: 360px;
  border-radius: 8px;
  padding: 8px 0 8px 8px;
  background: #272936;
}
</style>

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

---

- `/dev/console` 系统唯一控制台，系统级别显示(启动/关闭系统时)

- `/dev/ttyN` 系统直连终端每次会被分配到一个新的 tty

- `/dev/tty` 对每个终端独立，等价于自己的 tty

- `/dev/pts/N` ssh 等外部连接会被分配到的 tty

- `/proc/N/fd/N` 进程打开的文件描述符  

- `/proc/self/fd/` 当前 tty 打开的文件


---

<iframe
  class="terminal"
  src="https://devbox.zthxxx.me/tty/"
>
</iframe>

<br />

<iframe
  class="terminal"
  src="https://devbox.zthxxx.me/tty/"
>
</iframe>

<style>
.terminal {
  width: 80%;
  height: 360px;
  border-radius: 8px;
  padding: 8px 0 8px 8px;
  background: #272936;
}
</style>

<!--

tty

lsof /dev/pts/0 2> /dev/null

l /proc/1987003/fd

echo ok > /dev/pts/0

###########

exec 6<> ./testfd.txt
lsof ./testfd.txt 2>/dev/null

##########

ESC="\u001b"
ESC="\e"
CSI="${ESC}["

echo -e "${CSI}35;1mTitle of the Program ${CSI}0m"
  # Cursor Up        <ESC>[{COUNT}A
  # Cursor Down      <ESC>[{COUNT}B
  # Cursor Right     <ESC>[{COUNT}C
  # Cursor Left      <ESC>[{COUNT}D

  https://github.com/enquirer/enquirer/blob/master/lib/ansi.js

-->

---


输入但没有回车前的命令也是传给 shell 了，

只是因为没有换行符号，所以 shell 没有立刻解析执行，

因为 shell 在交互模式 (interactive) 下，所以才能控制光标编辑命令

---

[ANSI](https://en.wikipedia.org/wiki/ANSI_escape_code#Terminal_output_sequences)

```
ESC="\u001b"
ESC="\e"
CSI="${ESC}["

# Cursor Up        <ESC>[{COUNT}A
# Cursor Down      <ESC>[{COUNT}B
# Cursor Right     <ESC>[{COUNT}C
# Cursor Left      <ESC>[{COUNT}D
```

[SGR Colors](https://en.wikipedia.org/wiki/ANSI_escape_code#Colors)

```
<ESC>[<Front>;<Background>m
```

---

可以发送快捷键给另一个终端吗？

---

部分快捷键是 TTY 特性，[ANSI](https://en.wikipedia.org/wiki/ANSI_escape_code#Terminal_output_sequences) 是 **终端** 特性，剩的再是 Shell 处理

`stty -a` 

```
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
---


<iframe
  class="terminal"
  src="https://devbox.zthxxx.me/tty/"
>
</iframe>

<style>
.terminal {
  width: 80%;
  height: 360px;
  border-radius: 8px;
  padding: 8px 0 8px 8px;
  background: #272936;
}
</style>


<!-- 
read input
echo "$input"

stty -echo; read input
echo "$input"

echo '\e[?47h'  切换 tty 屏幕空间
echo '\e[?47l'
-->

---

\> To be continued

---

Ref Docs:

- https://en.wikipedia.org/wiki/Computer_terminal
- https://en.wikipedia.org/wiki/Teleprinter
- https://en.wikipedia.org/wiki/Terminal_emulator
- https://en.wikipedia.org/wiki/ANSI_escape_code
- https://stackoverflow.com/questions/18811129/full-screen-terminal-application-with-ruby-or-other-languages

---

Ref Pictures & Flow:

- https://en.wikipedia.org/wiki/Computer_terminal
- https://segmentfault.com/a/1190000016129862
- https://segmentfault.com/a/1190000009082089


---

<img
width="200" height="200"
alt="zthxxx"
src="https://avatars.githubusercontent.com/u/15135943"
style="border-radius: 50%; border: solid 1px #bbb;"
/>

[![zthxxx](https://badgen.net/badge/github/%20zthxxx%20/blue?icon=github&label&scale=2)](https://github.com/zthxxx)

[ [jovial](https://github.com/zthxxx/jovial) · [zsh-history-enquirer](https://github.com/zthxxx/zsh-history-enquirer) · [midk](https://github.com/zthxxx/midk) ]
