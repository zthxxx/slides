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

---

听说终端能显示图片？什么协议

<div class="text-[24px] w-full">

| 协议 | 序列 | 支持的终端 (部分) |
| --- | --- | --- |
| DEC Sixel | `ESC P … q <sixel 数据> ESC \` (DCS) | xterm、iTerm2、WezTerm、foot、Konsole、Windows Terminal、VS Code、tmux (编译时开启) |
| iTerm2 inline images | `ESC ] 1337 ; File=… : <base64> BEL` (OSC) | iTerm2、WezTerm、VS Code、Warp |
| kitty graphics | `ESC _ G <key=value> ; <base64> ESC \` (APC) | kitty、Ghostty、WezTerm、Konsole、iTerm2、Warp |
| 字符块 | 前景色、背景色各涂半格 `▀`，24 位色 | 支持 truecolor 的终端；chafa、timg 用它作回退 |

</div>

<div class="text-[26px] mt-4">图片也是写进输出流的转义序列；本页的 ghostty-web 0.4.0 不实现前三种协议</div>

<style>
  th:first-child, td:first-child { white-space: nowrap; }
</style>

<!--
- 三种图片协议都把图片数据塞进一段转义序列，写到终端的输出里；终端认识就画出来，不认识就整段丢掉
- Sixel 来自 DEC 的 VT 系列终端，用 DCS 包住，每个字符表示竖着的 6 个像素；iTerm2 的协议用 OSC 1337 带上 base64 的整张图片文件 (PNG、JPEG、GIF 都行)；kitty 的协议用 APC 传 base64 像素或文件，还能指定位置、层级、复用已上传的图片
- 终端之间支持度不一样：Ghostty 和 kitty 不支持 Sixel，只做 kitty 图形协议；Warp 支持 iTerm2 和 kitty 两种；tmux 只在编译时打开 Sixel 选项才会处理 Sixel，其他协议要靠 passthrough 透传
- chafa、timg 会探测终端支持哪种协议，都不支持时退回字符块：每个字符格画上下两个像素，`▀` 的前景色是上半格，背景色是下半格
- ghostty-web 0.4.0 的 WASM 里只有 APC 的解析入口，没有图片渲染，所以下一页用字符块演示
- 来源：[kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)、[iTerm2 Inline Images Protocol](https://iterm2.com/documentation-images.html)、[VT330/VT340 · Sixel Graphics](https://vt100.net/docs/vt3xx-gp/chapter14.html)、[Are We Sixel Yet?](https://www.arewesixelyet.com/)、[WezTerm imgcat](https://wezterm.org/imgcat.html)、[VS Code · Terminal Advanced](https://code.visualstudio.com/docs/terminal/advanced)、[chafa](https://hpjansson.org/chafa/)
-->

---

用字符块画一张图，再发一段 kitty 图片

<ShellDemo>
  <ShellStep run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["; OSC="${ESC}]"; ST="${ESC}\\"
for y in {0..7}; do for x in {0..47}; do printf "${CSI}38;2;$((x*5));$((y*32));200m${CSI}48;2;$((x*5));$((y*32+16));200m▀"; done; printf "${CSI}0m\n"; done' />
  <ShellStep run='printf "${ESC}_Ga=T,f=24,s=32,v=16;$(printf &#39;\xff\x40\x40%.0s&#39; {1..512} | base64 | tr -d &#39;\n&#39;)${ST}"; echo' />
</ShellDemo>

<!--
- 第一步声明 ESC 等变量后，用两层循环画一张 48×16 像素的渐变：每个 `▀` 的前景色 (`38;2;R;G;B`) 是上面一个像素，背景色 (`48;2;R;G;B`) 是下面一个像素，一行字符画两行像素
- 第二步按 kitty 图形协议发一张 32×16 的纯色 RGB 图片：`a=T` 传输并显示，`f=24` 是 RGB，`s`、`v` 是宽高，后面是 base64 的像素数据，整段用 APC (`ESC _ G … ESC \`) 包住
- 在这个页面里第二步什么也不显示：ghostty-web 0.4.0 解析了这段 APC 然后丢掉。同样的命令在 kitty、Ghostty 里会画出一块红色矩形
- 来源：[kitty graphics protocol · 传输 RGB 像素](https://sw.kovidgoyal.net/kitty/graphics-protocol/)、[ANSI escape code · 24-bit 颜色](https://en.wikipedia.org/wiki/ANSI_escape_code#24-bit)
-->
