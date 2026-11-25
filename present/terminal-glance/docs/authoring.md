# 编写 demo slides

一张 demo slide 由一个 `<ShellDemo>` 组成，里面是它的终端和一组有序的 `<ShellStep>` 按钮。
两个组件都从 `components/` 自动注册

```md
<ShellDemo terminals="a b">
  <ShellStep to="a" run="tty" />
  <ShellStep to="b" run="printf ok > /dev/pts/{a.pts}" />
  <ShellStep to="a" keys="⏎" />
  <ShellStep to="a" keys="^C" />
  <ShellStep to="a" keys="^C" run="stty icanon" />
  <ShellStep run="secret" />
</ShellDemo>
```


## `<ShellDemo>`

| Prop | 默认值 | 含义 |
| --- | --- | --- |
| `terminals` | `"a"` | 以空格分隔的终端名，从上到下堆叠。每个名字对应一个 shell，各自占一个 pty |
| `heights` | 等高 | 以空格分隔的各终端高度比例，例如 `heights="3 2"` 表示上面一个大终端、下面一个较小的控制终端。每个终端至少保留约十行，在页面中拖动调整过的高度优先 |

只有 demo 带 Step 时才显示 Step 列。Demo 占满 slide 的剩余高度，所以上方放一行说明没有问题；文字更长就会把终端挤小

每张 demo slide 都要有这样一行标题，说明 demo 展示什么 (例如 “往 A 的 pts 写一个 ^C”)。一个 demo 控制在 11 个 Step 左右，超过后 Step 列就要滚动。
需要演讲者停顿的地方 (比如进入 alternate screen) 单独作为一个 Step，不在命令里写 `sleep`

`<Terminal name="a" />` 也可以单独使用，不带 Step


## `<ShellStep>`

一个 Step 按以下顺序发送: `keys`，然后 `type`，最后 `run` 加 Enter

| Prop | 含义 |
| --- | --- |
| `to` | 目标终端名。默认为 demo 的第一个终端 |
| `keys` | 以空格分隔、按按键方式发送的键，例如 `"^C"`、`"^S l"`、`"↑ ⏎"`。具名按键定义在 `KEY_BYTES` (`runtime/steps.ts`)；其他内容按字面发送 |
| `type` | 像人一样逐字输入的文本，最后不按 Enter (用作正在运行的程序的输入，或输入到一半的一行) |
| `run` | 像人一样逐字输入的命令，然后按 Enter。文本中的换行按 Enter 输入；guest 的 `PS2`/`RPS2` 为空，所以多行输入没有续行前缀，同时保留缩进。`run=""` 只按 Enter |
| `action` | 代替输入的动作。`toggle-appearance` 把所有终端在深色和浅色之间切换，与标题栏的切换按钮效果相同 |

输入节奏最长 600 ms: 短文本每个字符最多 6 ms，长文本更快；每次按键后最多等 40 ms 再进行下一次输入。
长文本最多分约 24 次写入，所以即使是几百个字符的 Step，也会在点击后约 0.7 s 内输入并 echo 完毕。Shell 的执行时间不计入这 600 ms

Step 上的终端名标记 (`A`、`B`) 和终端标题栏里的名字，只在 demo 有多个终端时显示

每个终端标题栏都有一个共享的深色/浅色切换按钮。这个偏好在刷新后保留，与 Slidev 的页面主题相互独立，见 [终端共享的外观](./architecture.md#终端共享的外观)。
演示颜色查询时，运行 `terminal-colors`，用 `<ShellStep action="toggle-appearance" />` 切换主题，再运行一次。再运行一次 bat，可以演示由应用程序选择的语法配色；测试 jovial 的启动检测时，用 `exec zsh` 重新初始化 jovial

`agent-status-demo` 发出 root OSC 7501 report，并在 `blocked` 状态等待 Enter。标题栏显示最新的 report。演示时要标明这是模拟的 Agent: 脚本演示协议字节和终端行为，没有接入模型服务

多行命令直接在 attribute 里写真实的换行，缩进会照原样输入：

```md
  <ShellStep to="a" run="for i in {1..10}; do
  echo $i
  sleep 1
done" />
```

`type` / `run` 里的 `{a.pts}` 和 `{a.pid}`，在 Step 播放时替换为终端 `a` 的 pty 编号和它的 shell 的 pid。终端运行后，按钮上显示替换后的值

Step 可以重复点击，也可以按任意顺序点击。播放过的 Step 显示一个勾；这个勾只反映本次页面加载中的点击


### Attribute 中的转义

Step 的文本是 markdown 里的 HTML attribute，以 raw HTML 保留：

- 命令含双引号时，attribute 用单引号包裹，例如 `run='echo "you typed: $input"'`
- 命令同时含两种引号时，在单引号 attribute 里把每个单引号写成 `&#39;`；Vue 会解码 attribute 值里的 HTML entity，所以 shell 收到的是 `'`
- 反斜杠按字面传递 (`\x1b`、`\003`、`\n` 原样到达 shell)
- `<`、`>`、`$`、`{`、`}` 不需要转义；`&` 也不需要，除非它是 `&#39;` 这类 entity 的开头
- `<ShellDemo>` 块内不要有空行：空行会结束 markdown 的 raw HTML 块


### Step 中的 escape sequence

在一张 slide 的每个终端上，第一个输出 escape sequence 的 Step 在第一行声明这些变量名，在下一行使用，这样观众读到的是 `${CSI}`、`${OSC}`，不用读原始的 `\e[`：

```md
  <ShellStep run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["; OSC="${ESC}]"; ST="${ESC}\\"
echo "${OSC}7501;state=clear${ST}"' />
  <ShellStep run='echo "${OSC}7501;state=done${ST}"' />
```

同一终端上之后的 Step 复用这些变量；这些名字只存在于该终端的 shell 里。只有光标和颜色 Step 的 slide 声明 `ESC` 和 `CSI`；OSC 相关的 slide 声明全部 4 个。`pages/ansi-stty.md` 里的术语 slide 会介绍这些名字


## 各部分在哪里运行

| 窗口 | 终端 | Step |
| --- | --- | --- |
| Slide 窗口 (`/#/N`) | 页面里 Linux VM 上实时运行的 shell | 输入到 shell 中 |
| Presenter (`/#/presenter/N`) | 占位框 | 发送到同一浏览器的 slide 窗口，在那里输入 |
| Overview、下一张 slide 的预览、导出 | 占位框 | 不起作用 |

终端的 shell 在它的 slide 第一次显示时 spawn，所以 pty 编号按 slide 的访问顺序分配。回到一张 slide 时会重新连上同一个 shell，历史记录仍在


## 插图

新的图示组件把 SVG 渲染在 `<DiagramFrame>` (`components/diagrams/DiagramFrame.vue`) 里，以获得共用的图示样式


## 外站资源

为了让 Linux 跑在 4 个 CPU 上，deck 是 cross-origin isolated 的 ([isolation.md](./isolation.md))，embedder policy 为 `require-corp`。外站资源只有满足以下条件之一才会加载：

- 响应带 `Cross-Origin-Resource-Policy: cross-origin`，Google Fonts 和 GitHub 头像就会发送；或者
- 以 CORS 方式请求 (`<img crossorigin="anonymous">`、`<video crossorigin="anonymous">`)，且响应带 `Access-Control-Allow-Origin`，GitHub Pages 和 badgen.net 会发送它。
  Markdown 图片发出的不是 CORS 请求，所以这类图片要写成 HTML 标签，结尾 slide 的徽章就是这样写的

使用新的外站资源前，用 `curl -sI <url>` 检查。外站的 iframe 除非对方站点主动放行，否则完全无法加载，所以 deck 不嵌入任何 iframe

`<WebVideo src="…" page="…" title="…" />` 用浏览器自带的控件播放外站视频，并附上视频来源页面的链接。它在所在 slide 第一次显示时加载；预览和导出中只显示它的标题


## Speaker notes

每张 slide 的 notes (slide 里最后一个 `<!-- ... -->`) 写演讲提纲。Demo slide 的 notes 按编号依次解释各个 Step；命令本身只写在 `<ShellStep>` 里，presenter view 会把它们显示为按钮。
Notes 里的 `$` 要放在 code span 中，避免 KaTeX 把 `$...$` 当作数学公式


## 检查一个 demo

1. 在仓库根目录运行 `pnpm dev terminal-glance`
2. 打开 slide，按顺序点击每个 Step，检查两个终端的输出
3. 浏览过其他 slide 后再点击一遍：shell 必须仍有响应
4. Push 之前运行 `pnpm build`
