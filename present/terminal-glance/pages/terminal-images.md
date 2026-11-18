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
