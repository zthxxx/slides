#### [在浏览器地址栏输入URL到页面展示，背后发生了什么？](https://www.zhihu.com/question/34873227)

<!--
- 经典面试题：从输入 URL 到页面展示，要经过 DNS、TCP、TLS、HTTP、渲染，每一层都能无限展开
- 我们今天也走一遍类似的「全链路」，但范围缩小到终端
-->

---

简化亿点

#### *在地址栏敲下第一个按键到显示出字母发生了什么*

<!--
- 再缩小一点：只看敲下第一个按键，到屏幕上显示出这个字母
- 就这一个字母，也要经过键盘中断、操作系统输入事件、浏览器输入框、重绘好几层
- 接下来把场景换成终端
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
- 整条路径的轮廓，后面逐层展开：终端模拟器把按键编码成字节，写进 ptmx，经过内核 TTY 的 line discipline 交给 shell；shell 或 TTY 再把字节写回，由终端模拟器解析并渲染
- 屏幕上的字母是回显 (echo) 回来的输出，键盘只负责发出字节

演示 (右侧按钮把输入逐字敲进真实 shell；演讲者视图里点按钮，会在放映窗口执行)：
1. `echo hello`：最普通的一次输入、执行、输出
2. `showkey -a`，再依次输入 `a`、`↑`、`Enter`：看到 `97`、`27 91 65`、`13`。到了程序这一层只剩字节：方向键是转义序列 `ESC [ A`，Enter 是 `\r` (平时被 TTY 的 icrnl 转成 `\n`)
3. `Ctrl-D` 退出：它对应 stty 里的 `eof = ^D`，后面会讲谁在处理它

```sh
# A
echo hello
showkey -a      # 依次按 a、↑、Enter
# A: 按 Ctrl-D 退出
```
-->
