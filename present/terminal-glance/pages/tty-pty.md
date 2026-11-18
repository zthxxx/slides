例如这样一个 Terminal

<ShellDemo>
  <ShellStep run="tty" />
  <ShellStep run="echo $TERM" />
  <ShellStep run="ls -l /proc/$$/fd/{0..2}" />
  <ShellStep run="ls /dev/pts/" />
  <ShellStep run="tmux" />
  <ShellStep keys="^S l" />
  <ShellStep run="tty" />
  <ShellStep keys="^D" />
  <ShellStep keys="^D" />
</ShellDemo>

<!--
- 这个页面里的终端有两部分：ghostty-web 负责渲染 (终端模拟器，Ghostty 的 VT 解析器编译成 WebAssembly)，页面里运行的 Linux 内核提供 PTY 和 shell
- 在内核眼里它就是一个 PTY：shell 的 0、1、2 三个 fd 都指向一个 pts 设备

演示：
1. `tty`：当前 shell 标准输入连接的终端设备，`/dev/pts/N`
2. `echo $TERM`：`xterm-256color`，程序靠终端类型决定用哪套转义序列
3. `ls -l /proc/$$/fd/{0..2}`：fd 0、1、2 都指向这个 pts，shell 的 stdin、stdout、stderr 就是这个 tty
4. `ls /dev/pts/`：每打开一个伪终端就多一个编号 (上一页的终端也还在)，另外还有 `ptmx`
5. `tmux` 后按 `Ctrl-S l` 向右分屏 (镜像里是 zthxxx/tmux-config，prefix 是 Ctrl-S)，在新窗格里 `tty`：又多了一个 pts。tmux server 自己持有 ptmx，给每个窗格开一个 pts，和后面 ssh 那页的结构一样
6. 两次 `Ctrl-D`：依次退出两个窗格里的 shell，tmux 随之结束
-->

---

TTY 负责控制字符的输入输出

<TtyDriverDiagram />

<!--
- TTY 可以看作一根带处理逻辑的双向管道，一端接终端，一端接进程
- 中间的 line discipline 负责：回显 (echo)；行缓冲与行编辑 (icanon，比如退格、Ctrl-U)；把特殊字符转成信号 (isig，比如 Ctrl-C 转成 SIGINT)；换行转换 (icrnl、onlcr)
- 一个 tty 上可以挂多个进程，但输入只交给前台进程组
-->

---


<ForegroundGroupDiagram />

<!--
- 一个 tty 同一时刻只有一个前台进程组，它既能读也能写，对应图中的 bash (R/W)
- 后台进程组默认 (-tostop) 仍然可以写 tty；但它一读 tty 就会收到 SIGTTIN 被暂停，对应图中只有 W 的 fish
- shell 每启动一个前台任务，就把 tty 的前台进程组切到这个任务，任务结束后再切回自己
-->

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

<!--
- 同一段循环，一个直接在前台跑，一个加上括号和 `&` 放到后台跑
- 请大家预测：两种情况下按 Ctrl-C 有什么区别？在循环运行时打字会发生什么？
-->

---

<ShellDemo terminals="a b">
  <ShellStep to="a" run="for i in {1..10}; do
  echo $i
  sleep 1
done" />
  <ShellStep to="a" keys="^C" />
  <ShellStep to="a" run="(
  for i in {1..10}; do
    echo $i
    sleep 1
  done
)&" />
  <ShellStep to="a" keys="^C" />
  <ShellStep to="a" run="jobs" />
  <ShellStep to="a" run="read x &" />
  <ShellStep to="a" run="jobs" />
  <ShellStep to="b" run="ps -o pid,ppid,pgid,tty,stat,args | grep -v ' ? '" />
</ShellDemo>

<!--
- 前台和后台进程都能往 tty 输出，区别在于谁能读取输入、谁会收到 Ctrl-C

演示：
1. A 跑前台循环，每秒输出一个数字；期间在 A 里随手打几个字：字符被回显但不执行，TTY 把它们缓冲着，等循环结束才交给 shell
2. A 按 `Ctrl-C`：line discipline 把 ^C 转成 SIGINT 发给前台进程组，循环中止
3. A 跑后台循环：提示符立刻返回，数字照样打印，说明后台进程可以写 tty
4. 再按 `Ctrl-C`：只换了一行新提示符，后台循环不受影响
5. `jobs`：后台作业状态为 Running
6. `read x &` 再 `jobs`：显示 `suspended (tty input)`，后台进程组去读 tty 收到 SIGTTIN 被暂停，对应前面图里只有 W 的 fish
7. B 执行 `ps`：PGID 列就是进程组，被暂停的 `read` 状态是 `T`；TT 列的 `136,N` 是 pts 的主、次设备号 (busybox ps 不显示设备名)
-->

---

ssh & pts

<SshPtsDiagram />

<!--
- ssh 登录时，sshd 认证通过后调用 `posix_openpt()` 打开 /dev/ptmx 拿到 master fd，内核同时创建 slave 设备 /dev/pts/N
- sshd fork 出 shell，把 shell 的 0、1、2 绑到 pts/N；之后 sshd 在 ssh 协议和 ptmx fd 之间来回搬运字节
- 终端模拟器 (iTerm2，或这个页面里的 ghostty-web) 做的是同一件事，只是不经过网络；tmux 也一样，tmux server 持有 ptmx，为每个窗格创建一个 pts
- 连接断开时 master 被关闭，内核会给这个会话发 SIGHUP
-->

---

- `/dev/console` 系统唯一控制台，系统级别显示(启动/关闭系统时)

- `/dev/ttyN` 系统直连终端每次会被分配到一个新的 tty

- `/dev/tty` 对每个终端独立，等价于自己的 tty

- `/dev/pts/N` ssh 等外部连接会被分配到的 tty

- `/proc/N/fd/N` 进程打开的文件描述符

- `/proc/self/fd/` 当前进程打开的文件描述符

<!--
- /dev/console：系统唯一的控制台，内核启动和关机时的消息都输出到这里
- /dev/ttyN 是虚拟控制台；/dev/tty 是个特殊文件，永远指向当前进程自己的控制终端
- /dev/pts/N 是 PTY 的 slave 端，由 ssh、终端模拟器、tmux 分配
- /proc/N/fd/ 列出进程 N 打开的 fd；/proc/self 指正在读取它的进程自己
- 本演示环境的 console 是 /dev/hvc0 (虚拟化控制台)，没有 /dev/ttyN，页面上的终端都是 /dev/pts/N
-->

---

<ShellDemo terminals="a b">
  <ShellStep to="a" run="tty" />
  <ShellStep to="b" run="tty" />
  <ShellStep to="b" run="lsof /dev/pts/{a.pts}" />
  <ShellStep to="b" run="ls -l /proc/{a.pid}/fd/{0..2}" />
  <ShellStep to="b" run="printf ok > /dev/pts/{a.pts}" />
  <ShellStep to="a" keys="⏎" />
  <ShellStep to="a" run="exec 6<> ./testfd.txt" />
  <ShellStep to="a" run="ls -l /proc/$$/fd/{0,1,2,6}" />
  <ShellStep to="b" run="lsof ./testfd.txt" />
  <ShellStep to="b" run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["
printf "${CSI}35;1mTitle of the Program${CSI}0m" > /dev/pts/{a.pts}' />
  <ShellStep to="a" keys="⏎" />
  <ShellStep to="a" run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["
printf "Hello World${CSI}5D*****\n"' />
  <ShellStep to="b" run="stty -F /dev/pts/{a.pts} -a | grep icanon" />
</ShellDemo>

<!--
- 用两个终端验证一件事：tty 就是一个文件，谁有权限，谁就能往里写
- 按钮里的 pts 编号和 pid 在点击时按 A 的实际值填入

演示：
1. A、B 各执行 `tty`：同一台机器上的两个 PTY
2. B `lsof /dev/pts/<A>`：A 的 zsh 的 0、1、2 都打开着 A 的 pts；再看 `ls -l /proc/<A 的 shell pid>/fd/{0..2}`，从 /proc 看到同样的结果
3. B `printf ok > /dev/pts/<A>`：ok 出现在 A 的提示符后面，看起来像是在 A 里敲进去的。回到 A 按回车，zsh 只换了一行新提示符，ok 没有被执行。留个问题给大家：ok 去哪了，回车为什么不执行它？后面 ^C 那页揭晓
4. A `exec 6<> ./testfd.txt` 再 `ls -l /proc/$$/fd/{0,1,2,6}`：shell 多出 fd 6；B `lsof ./testfd.txt` 也能看到。fd 只是进程打开文件的编号，0、1、2 是约定
5. B 第一行把 ESC (0x1B) 和 CSI (`ESC [`) 存进变量，第二行往 A 写 `${CSI}35;1m…${CSI}0m`：A 上出现紫色粗体字，颜色是终端模拟器解析 ANSI 序列的结果，与 shell 无关；同样回到 A 按回车。ESC、CSI 这些名字后面 ANSI 那页展开
6. A 同样先声明变量 (变量只在各自的 shell 里)，再 `printf "Hello World${CSI}5D*****\n"`：光标左移 5 格后覆盖写入，显示 `Hello *****`
7. B `stty -F /dev/pts/<A> -a | grep icanon`：A 停在提示符时是 `-icanon -echo`，为下一页做铺垫
-->

---

- 输入但没有回车前的命令也是传给 shell 了

- 只是因为没有换行符号，所以 shell 没有立刻解析执行

- 因为 shell 在交互模式 (interactive) 下，所以才能控制光标编辑命令

<!--
- 交互模式下，shell 的行编辑器 (zsh 的 zle、bash 的 readline) 把 tty 切到非规范模式 (`-icanon -echo`)，每个按键都立刻交给 shell
- 所以按回车之前字符已经到了 shell；回显、光标移动、退格、补全、历史，都是 shell 自己用 ANSI 序列画出来的
- 按下回车 shell 才解析并执行；执行前它恢复规范模式，把前台交给这个命令
- 证据：上一页最后一步，A 停在提示符时 `stty -F` 看到 `-icanon -echo`；后面 ^C 那页会对比 A 跑 sleep 时的 `icanon echo`
-->
