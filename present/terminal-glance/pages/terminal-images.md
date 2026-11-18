听说终端能显示图片？什么协议

<div class="image-protocols text-[25px] w-full">

| 协议 | 序列 | 图片数据 | 常见支持 |
| --- | --- | --- | --- |
| [iTerm2 inline images](https://iterm2.com/documentation-images.html) | `ESC ] 1337 ; File=inline=1 : <base64> ST` | 整个文件：PNG、JPEG… | iTerm2、WezTerm、VS Code |
| [kitty graphics](https://sw.kovidgoyal.net/kitty/graphics-protocol/) | `ESC _ G a=T,f=100 ; <base64> ST` | PNG 或像素，分块发送 | kitty、Ghostty、WezTerm |

</div>

<div class="text-[26px] mt-6">图片也是程序写进输出流的一段转义序列；终端认识就画出来，不认识就整段丢掉</div>

<style>
  .image-protocols th:first-child, .image-protocols td:first-child { white-space: nowrap; }
  .image-protocols td:nth-child(2) code, .image-protocols td:last-child { white-space: nowrap; }
</style>

<!--
- 图片走的还是同一条输出流：程序把图片编码成 base64，包进一段转义序列写到 stdout，经 PTY 到终端模拟器；终端把这段字节解码成图片，画在光标所在的格子上，再把光标移到图片后面
- iTerm2 的协议是一个 OSC：`ESC ] 1337 ; File=参数 : base64 ST` (也可以用 BEL 结尾)，一次带上整个图片文件，格式交给终端解码；`inline=1` 才显示在终端里，`width`、`height` 可以写格数、`px` 或百分比
- kitty 的协议是一个 APC：`ESC _ G 控制参数 ; base64 ESC \`。`a=T` 传输并显示，`f=100` 是 PNG (`f=24`、`f=32` 是 RGB、RGBA 像素)，`c`、`r` 是占几列几行；数据超过 4096 字节要分块，第一块带控制参数和 `m=1`，中间的块只写 `m=1`，最后一块 `m=0`。它还能按 id 存下图片，之后用 `a=p` 在别处再放一次，或用 `a=d` 删除
- 终端不认识这段序列时，按 ECMA-48 把整个 OSC / APC 字符串丢掉，屏幕上不会出现乱码，这也是程序敢直接发送的原因；chafa、`kitten icat` 这类工具会先查询终端支持哪种协议
- 支持情况只列了几个常见终端：kitty 文档列出的实现方还有 Konsole、iTerm2、Warp 等；VS Code 要打开 `terminal.integrated.enableImages`。本页终端用的 ghostty-web 0.4.0 会解析这两种序列然后丢掉，所以这个 deck 在它外面加了一层：把图片序列从输出里取出来，按协议算好占几格、移动光标，再把图片画在画布上方
- 来源：[iTerm2 Inline Images Protocol](https://iterm2.com/documentation-images.html)、[kitty graphics protocol · 分块传输与实现列表](https://sw.kovidgoyal.net/kitty/graphics-protocol/)、[WezTerm · iTerm2 image protocol](https://wezterm.org/imgcat.html)、[VS Code · Terminal images](https://code.visualstudio.com/docs/terminal/advanced)
-->

---

在终端里显示一张图片：kitty 与 iTerm2 协议

<ShellDemo>
  <ShellStep run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["; OSC="${ESC}]"; ST="${ESC}\\"
data=$(base64 -w0 ~/chinatsu-bot-avatar.png); keys="a=T,f=100,c=24,"
while [[ -n $data ]]; do
  printf "${ESC}_G${keys}m=%d;%s${ST}" $(( ${#data} > 4096 )) "${data[1,4096]}"
  data=${data[4097,-1]}; keys=
done; echo' />
  <ShellStep run='printf "${OSC}1337;File=inline=1;width=24:%s${ST}" "$(base64 -w0 ~/chinatsu-bot-avatar.jpeg)"; echo' />
  <ShellStep run='printf "${OSC}1337;File=inline=1;width=24:%s${ST}" "$(base64 -w0 ~/chinatsu-bot-avatar.jpeg)" | head -c 72 | cat -v; echo' />
  <ShellStep run="clear" />
</ShellDemo>

<!--
- 第一步按 kitty 协议发图：声明 ESC、CSI、OSC、ST，把 256 像素的 PNG 转成 base64，每次取 4096 字节发一个 APC。第一块带上 `a=T,f=100,c=24`：传输并显示、PNG、占 24 列，行数按图片比例算；后面的块只带 `m`，`m=1` 表示后面还有，最后一块 `m=0`。光标随后移到图片右下角，`echo` 换行
- 第二步按 iTerm2 协议发同一张图的 JPEG 原图：一个 OSC 带上整个文件的 base64，`width=24` 同样占 24 列，高度保持比例；1080 像素的原图由终端缩放
- 第三步把同一条命令的输出交给 `cat -v` 而不是终端：只看前 72 个字节，是 `^[]1337;File=inline=1;width=24:/9j/4AAQ…`。`^[` 是 ESC，`/9j/` 是 JPEG 文件头的 base64。图片就是输出流里的一段字节，进了终端才变成图
- `clear` 清屏，图片和文字一起被清掉
- 图片文件在镜像的 /root 下：chinatsu-bot-avatar.jpeg (1080×1080) 和缩小到 256×256 的 chinatsu-bot-avatar.png
- 来源：[kitty graphics protocol · 分块传输](https://sw.kovidgoyal.net/kitty/graphics-protocol/#remote-client)、[iTerm2 Inline Images Protocol](https://iterm2.com/documentation-images.html)
-->
