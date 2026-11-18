听说终端能响应鼠标交互？怎么响应的

<div class="text-[26px] w-full">

| 步骤 | 字节 | 方向 |
| --- | --- | --- |
| 申请 | `CSI ? 1000 h` 点击、`1002 h` 拖动、`1003 h` 任意移动；`CSI ? 1006 h` 换成 SGR 编码 | 程序 → 终端 |
| 上报 | `CSI < 0 ; 12 ; 5 M`：左键在第 12 列第 5 行按下，结尾 `m` 是松开；滚轮是按钮 64 / 65 | 终端 → 程序 |
| 解码 | 和按键在同一个 stdin 里，按 `CSI <` 前缀区分 | 程序自己：tmux、htop、nvim |

</div>

<div class="text-[26px] mt-4">鼠标事件也只是输入流里的字节；程序没有申请时，终端把拖动当作选中文字</div>

<style>
  th:first-child, td:first-child { white-space: nowrap; }
  th:last-child, td:last-child { white-space: nowrap; }
</style>

<!--
- 鼠标和按键走同一条路：终端模拟器把点击编码成字节，写进 ptmx，经 TTY 交给前台程序。内核不知道这是鼠标，程序自己解析
- 程序要先用 DECSET 申请：9 只报按下 (X10 兼容)，1000 报按下和松开，1002 再加上按住拖动，1003 报所有移动；关掉用同样的编号加 `l`
- 编码格式另外申请。默认的 X10 格式把按钮和坐标各加 32 后作为一个字节发出，坐标超过 223 就没法表示；1006 的 SGR 格式用十进制参数：`CSI < 按钮 ; 列 ; 行 M`，松开时结尾是 `m`。按钮 0、1、2 是左中右键，加 32 表示拖动，64、65 是滚轮上下，再加 4、8、16 表示同时按着 Shift、Meta、Ctrl
- tmux 开了 `mouse on` 后会申请这些模式，所以能点选 pane、拖动分隔线、滚轮进入 copy mode；htop 可以点表头排序；nvim 的 `mouse` 选项默认就是 `nvi`，普通、可视和插入模式都接收鼠标
- 程序申请了鼠标上报以后，拖动不再选中文字；本页的终端和多数终端一样，按住 Shift 拖动仍然可以选中
- 来源：[XTerm Control Sequences · Mouse Tracking](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Mouse-Tracking)、[tmux(1) · mouse](https://github.com/tmux/tmux/blob/3.7c/tmux.1)、[Neovim · mouse](https://neovim.io/doc/user/options.html#'mouse')
-->

---

打开鼠标上报，看终端发来的字节

<ShellDemo>
  <ShellStep run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["; OSC="${ESC}]"; ST="${ESC}\\"
printf "${CSI}?1000h${CSI}?1006h"; stty -echo
while read -rsk c; do print -rn -- ${(V)c}; done' />
  <ShellStep keys="^C" run='printf "${CSI}?1006l${CSI}?1000l"; stty sane' />
  <ShellStep run="htop" />
  <ShellStep type="q" />
</ShellDemo>

<!--
- 第一步声明 ESC、CSI、OSC、ST，申请 1000 和 1006，并关掉 TTY 的回显；第二行是 zsh 的循环：`read -k` 每次读一个字符，`${(V)c}` 把控制字符显示成 `^[` 这样的可见形式，和 `cat -v` 的写法一样，字节一到就打印
- 演讲者在终端里点几下、滚一滚滚轮：每个动作立刻出现 `^[[<0;12;5M^[[<0;12;5m` 这样的序列，`^[` 就是 ESC。左键按下以 M 结尾，松开以 m 结尾，右键是 2，滚轮是 `<64;` 和 `<65;`，坐标从 1 开始
- `^C` 结束循环：ISIG 还开着，Ctrl-C 照常变成 SIGINT。随后关掉 1006 和 1000，`stty sane` 恢复 TTY 设置；不关的话，点击产生的字节会落进 zsh 的输入行
- `htop` 自己申请了鼠标上报：点表头按那一列排序，点一行选中进程；按 `q` 退出，htop 退出时会关掉这些模式
- 来源：[XTerm Control Sequences · SGR mouse mode](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Extended-coordinates)、[stty(1)](https://man7.org/linux/man-pages/man1/stty.1.html)
-->
