#!/bin/sh
# Provisions the terminal-glance guest image. Runs inside unkernel's Alpine
# (busybox ash, root) booted by image/vm/provision.ts with a network and a
# fresh data disk: / is the overlay of the bundled initramfs and
# /data/overlay/upper, so everything installed here lands on the data disk,
# which is the image the page boots with (no network there).
#
# /provision (this directory, read-only over 9p):
#   packages.txt   apk packages to install
#   rootfs/        files copied over / (root's .zshrc)
# Environment from the driver: IMAGE_INPUT_HASH, UNKERNEL_VERSION.
set -eu
set -o pipefail

P=/provision
OV=/data/overlay
export HOME=/root TERM=xterm-256color
export XDG_CONFIG_HOME=$HOME/.config XDG_DATA_HOME=$HOME/.local/share
cd "$HOME"

step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n!!! %s\n' "$*" >&2; exit 1; }

step "root file system"
root_type=$(awk '$2 == "/" { t = $3 } END { print t }' /proc/mounts)
[ "$root_type" = overlay ] || fail "/ is $root_type, not the overlay on the kwdata disk (is the data disk attached?)"
mountpoint -q /data || fail "/data is not mounted"
echo "/ is the overlay over $OV/upper; lower image $(cat /usr/lib/kw-image)"

step "apk packages"
/etc/kw-apk-enable                     # community: neovim, ...
apk_install() {
  apk update && \
    # shellcheck disable=SC2046 # one word per package
    apk add --no-cache $(sed -e 's/#.*//' "$P/packages.txt")
}
# image/build.ts passes the fastest mirror from the build host. When apk fails on it (not synced, a bad response),
# the install runs again on the official repositories, which the image keeps in any case.
cp /etc/apk/repositories /tmp/repositories.default
if [ -n "${APK_MIRROR:-}" ]; then
  sed -i -E "s#^https?://[^/]+/alpine#${APK_MIRROR%/}/alpine#" /etc/apk/repositories
  cat /etc/apk/repositories
fi
if ! apk_install; then
  [ -n "${APK_MIRROR:-}" ] || fail "apk failed on the official repositories"
  echo "!!! apk failed on $APK_MIRROR; retrying on the official repositories"
  cp /tmp/repositories.default /etc/apk/repositories
  apk_install || fail "apk failed on the official repositories too"
fi
mv /tmp/repositories.default /etc/apk/repositories

step "root's files and login shell"
cp -R "$P/rootfs/." /
chown -R root:root "$HOME"
chmod 700 "$HOME"
chmod 644 "$HOME/.zshrc"
grep -qx /bin/zsh /etc/shells || echo /bin/zsh >> /etc/shells
# kwtty starts root's passwd shell for every host terminal (unkernel kernel/guest/kwtty.c, getpwuid(0)).
sed -i -e 's#^\(root:[^:]*:0:0:[^:]*:[^:]*:\).*$#\1/bin/zsh#' /etc/passwd
grep '^root:' /etc/passwd

step "bat and terminal query demo"
bat --version
bash -n /usr/local/bin/terminal-colors
sh -n /usr/local/bin/agent-status-demo
bat --paging=never --theme=auto --color=never /root/hello.sh >/dev/null

step "inline image demo files"
# pages/terminal-images.md sends these with `base64 -w0` inside iTerm2 and kitty image sequences.
for image in /root/chinatsu-bot-avatar.jpeg /root/chinatsu-bot-avatar.png; do
	[ -n "$(base64 -w0 "$image" | head -c 16)" ] || fail "cannot base64 $image for the image demo"
done

step "tmux: the config loads, and its default-terminal has a terminfo entry"
[ -e /usr/share/terminfo/t/tmux-256color ] || [ -e /etc/terminfo/t/tmux-256color ] ||
	fail "no terminfo for tmux-256color (default-terminal in ~/.config/tmux/tmux.conf)"
# The config reads $SHELL for default-shell; in the page it comes from root's passwd entry.
errors=$(SHELL=/bin/zsh tmux -L provision -f /dev/null new-session -d -x 80 -y 24 \; \
	source-file "$HOME/.config/tmux/tmux.conf" 2>&1) || fail "tmux rejected ~/.config/tmux/tmux.conf: $errors"
tmux -L provision kill-server 2>/dev/null || true
[ -z "$errors" ] || fail "tmux printed errors for ~/.config/tmux/tmux.conf: $errors"

step "zsh plugins: jovial and fast-syntax-highlighting, the two ~/.zshrc loads"
# Each at its default branch's head, recorded in the image stamp. Only what the shell loads is kept: jovial's two
# files, fast-syntax-highlighting without its git history, screenshots and tests.
plugins="$XDG_DATA_HOME/zsh-plugins"
clones=/tmp/zsh-plugin-clones
clone() {
	git clone --quiet --depth 1 "https://github.com/$1" "$clones/$2" >&2 &&
		git -C "$clones/$2" log -1 --format="%h %cs"
}
jovial_rev=$(clone zthxxx/jovial jovial) || fail "cannot clone jovial"
fsh_rev=$(clone zdharma-continuum/fast-syntax-highlighting fast-syntax-highlighting) ||
	fail "cannot clone fast-syntax-highlighting"
mkdir -p "$plugins/jovial"
cp "$clones/jovial/jovial.zsh-theme" "$clones/jovial/jovial.plugin.zsh" "$clones/jovial/LICENSE" "$plugins/jovial/"
cp -R "$clones/fast-syntax-highlighting" "$plugins/"
rm -rf "$clones" "$plugins/fast-syntax-highlighting/.git" "$plugins/fast-syntax-highlighting/.github" \
	"$plugins/fast-syntax-highlighting/images" "$plugins/fast-syntax-highlighting/test" \
	"$plugins/fast-syntax-highlighting/tests"
echo "jovial $jovial_rev, fast-syntax-highlighting $fsh_rev"
[ "$(ls "$plugins" | tr '\n' ' ')" = "fast-syntax-highlighting jovial " ] || fail "unexpected plugins: $(ls "$plugins")"

step "compile what zsh reads at start"
# zsh also parses every script it sources, at every start. It reads file.zwc in place of a sourced script, a startup
# file or an autoloaded function when it is newer (zshbuiltins(1), zcompile). The offline start below then runs on
# the compiled files.
zsh -c 'plugins=$XDG_DATA_HOME/zsh-plugins fsh=$XDG_DATA_HOME/zsh-plugins/fast-syntax-highlighting
	for f in ~/.zshrc $plugins/jovial/*.(zsh|zsh-theme) \
		$fsh/fast-syntax-highlighting.plugin.zsh $fsh/fast-highlight $fsh/fast-string-highlight $fsh/fast-theme; do
		zcompile "$f" || { print -u2 -r -- "cannot compile $f"; exit 1 }
		print -r -- "$f.zwc"
	done' || fail "zcompile failed"

step "no unwanted tools pulled in as dependencies"
for cmd in node python3 zoxide; do
	! command -v "$cmd" >/dev/null || fail "$cmd is installed ($(command -v "$cmd")), the image must not ship it"
done

step "offline start: no network, no errors"
ip link set eth0 down 2>/dev/null || true
# The page loads fast-syntax-highlighting after the first prompt; `zsh -i -c` has no prompt, so it loads it here.
errors=$(zsh -i -c .terminal-glance-load-highlighting 2>&1 </dev/null >/dev/null) || fail "zsh -i failed offline: $errors"
[ -z "$errors" ] || fail "zsh -i printed errors offline: $errors"
# fast-syntax-highlighting downloads its secondary theme on every start unless the work dir has it (~/.zshrc);
# the image's copy must load the plugin's `free` styles, which the highlighter checks for (`freedefault`).
errors=$(zsh -i -c '.terminal-glance-load-highlighting
	[[ $FAST_WORK_DIR == $XDG_CONFIG_HOME/fsh ]] || { print -r -- "work dir is $FAST_WORK_DIR"; exit 1 }
	source $FAST_WORK_DIR/secondary_theme.zsh 2>&1 && (( ${+FAST_HIGHLIGHT_STYLES[freedefault]} )) ||
		{ print -r -- "$FAST_WORK_DIR/secondary_theme.zsh sets no free styles"; exit 1 }' </dev/null 2>&1) ||
	fail "fast-syntax-highlighting would download its secondary theme on the page: $errors"
# Every compiled file is still newer than its source, so zsh keeps reading it.
stale=$(zsh -c 'for f in ~/**/*.zwc(D.N); do [[ ${f%.zwc} -nt $f ]] && print -r -- $f; done; exit 0')
[ -z "$stale" ] || fail "compiled files older than their sources: $stale"

step "image stamp"
cat > /etc/terminal-glance-image <<EOF
inputs=${IMAGE_INPUT_HASH:-unknown}
unkernel=${UNKERNEL_VERSION:-unknown}
lower=$(cat /usr/lib/kw-image)
built=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jovial=$jovial_rev
fast-syntax-highlighting=$fsh_rev
EOF
cat /etc/terminal-glance-image

step "clean caches"
rm -rf /var/cache/apk/* /var/cache/kw-apk "$HOME/.cache" "$HOME/.wget-hsts" \
	"$HOME/.zsh_history" "$HOME/.ash_history" "$HOME/.lesshst" /tmp/* 2>/dev/null || true

step "sizes"
# One du per path: du counts an inode once, so a nested path in the same call would print nothing.
for d in "$OV/upper" "$OV/upper/usr/lib" "$OV/upper/usr/share" "$OV/upper/usr/bin" "$XDG_DATA_HOME/zsh-plugins"; do
	du -sh "$d" 2>/dev/null || true
done
df -h /data

step "zero the free blocks"
sync
# The driver's disk turns discards into zeros, so the packer can skip free space.
if ! fstrim -v /data; then
	echo "fstrim failed, zero-filling instead"
	dd if=/dev/zero of=/data/.zero bs=1M 2>/dev/null || true
	rm -f /data/.zero
fi

step "boot markers"
# A clean first boot on the page: no failed-boot count, no safe mode request.
rm -f "$OV/attempts" "$OV/safe"
ls -la "$OV"
sync
step "done"
