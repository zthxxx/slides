## 终端 (Terminal) 是什么

<!--
- 日常说的「终端」混了好几层：硬件、内核里的 TTY 子系统、终端模拟器 App，以及在里面跑的 shell
- 下一页列出这些名词，再借终端的历史理清它们为什么叫这些名字
-->

---

`Console` (控制台), `TTY` (Teletypewriter)

`Terminal` (终端), `CLI` (命令行界面), `Shell`

`PTMX` (pseudo-terminal master), `PTS` (pseudo-terminal slave)

`PTY` (pseudo terminal device)

<!--
- Console (控制台)：与主机一体的特殊终端，给系统管理员用，也是系统级消息输出的地方
- TTY：Teletypewriter 的缩写，后来既指内核里的终端子系统，也成了「终端」的统称
- Terminal 是输入输出环境；CLI 是用文本交互的界面形态；Shell 是命令解释器，提示符、行编辑、历史记录都属于 shell
- PTY 由 PTMX (master) 和 PTS (slave) 成对组成：master 端交给终端模拟器或 sshd，slave 端交给 shell
-->

---

### 终端的历史

<!--
- 这些名字都来自硬件时代；理解了历史，就能理解为什么今天的内核里还有 TTY
-->

---

<Zoomable class="history-photo">

![ENIAC-console-panel](/images/ENIAC-console-panel.jpg)

</Zoomable>

早期的电子管电脑，有一堆按钮组成的控制台 (`Console`)

<style>
  p {
    @apply w-full flex justify-center items-center;
  }

  .history-photo {
    @apply w-1/2 mx-auto;

    img {
      @apply w-full;
    }
  }
</style>

<!--
- 早期电子管计算机的控制台就是一面按钮和指示灯，操作员直接拨开关、看灯
- Console 这个词就是从这里来的：与主机一体，并且只有一个
-->

---

<Zoomable class="history-photo">

![Teletype](/images/Teletype.jpg)

</Zoomable>

后来有了键盘，可以输入，打字在纸上 (`Teletype`)

<style>
  p {
    @apply w-full flex justify-center items-center;
  }

  .history-photo {
    @apply w-1/2 mx-auto;

    img {
      @apply w-full;
    }
  }
</style>

<!--
- 电传打字机本来用来收发电报：按键发出信号，收到的信号打印在纸卷上 (ASR-33 还带一个纸带穿孔机和读带机)
- Unix 要支持多用户，选了便宜的 ASR-33 当终端，所以内核里的终端设备至今叫 tty
- 当时的链路：终端 → Modem → 线路 → UART → 计算机；内核 TTY 子系统由 UART driver、line discipline、TTY driver 三层组成
-->

---

<Zoomable class="history-photo">

![DECVT100-terminal](/images/DECVT100-terminal.jpg)

</Zoomable>

再往后有了显示器，和键盘一起组成多用户输入输出 `Terminal`，系统级别才显示到 `Console`

<style>
  p {
    @apply w-full;
  }

  .history-photo {
    @apply w-1/2 mx-auto;

    img {
      @apply w-full;
    }
  }
</style>

<!--
- 后来有了显示器：DEC VT100 (1978) 支持 ANSI 转义序列、可以定位光标，成了「智能终端」的事实标准
- 每个用户各用一台终端接入主机，系统级消息仍然只输出到 Console
- 今天的终端模拟器大多还在模拟 VT100 / xterm，`$TERM` 声明的就是模拟哪一种
-->

---

来到主机时代图形界面，没有这样的物理设备了，

<!--
- 到了 PC 时代，键盘和显示器直接接在主机上，物理终端消失了，但内核的 TTY 架构完整保留了下来
- 用户空间程序不需要任何改动，读写的依旧是一个 tty 设备文件
-->

---

- 终端变成了软件：内核里的虚拟控制台，和图形界面里的终端模拟器
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
- Virtual Console：Linux 上 Ctrl+Alt+F1~F6 切出的全屏字符界面，由内核直接提供，对应 /dev/tty1~6；图形界面崩了还能用它救火
- Terminal Emulator：图形界面里的终端窗口，比如 iTerm2、gnome-terminal，或者这个页面里的 ghostty-web。它们是用户态的普通程序，不在内核里，通过 PTY 接入内核的 TTY
- 内核里管理终端输入输出的部分统称 TTY；接入 TTY、给用户用的 App 统称终端
-->
