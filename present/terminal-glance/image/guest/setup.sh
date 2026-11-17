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
apk update
# shellcheck disable=SC2046 # one word per package
apk add --no-cache $(sed -e 's/#.*//' "$P/packages.txt")

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

step "tmux: the config loads, and its default-terminal has a terminfo entry"
[ -e /usr/share/terminfo/t/tmux-256color ] || [ -e /etc/terminfo/t/tmux-256color ] ||
	fail "no terminfo for tmux-256color (default-terminal in ~/.config/tmux/tmux.conf)"
# The config reads $SHELL for default-shell; in the page it comes from root's passwd entry.
errors=$(SHELL=/bin/zsh tmux -L provision -f /dev/null new-session -d -x 80 -y 24 \; \
	source-file "$HOME/.config/tmux/tmux.conf" 2>&1) || fail "tmux rejected ~/.config/tmux/tmux.conf: $errors"
tmux -L provision kill-server 2>/dev/null || true
[ -z "$errors" ] || fail "tmux printed errors for ~/.config/tmux/tmux.conf: $errors"

step "zinit: clone zinit and the plugins ~/.zshrc loads, nothing else"
# burst runs the turbo (wait) loads now instead of after the first prompt, so they are cloned too.
zsh -i -c '@zinit-scheduler burst' </dev/null
zinit_home="$XDG_DATA_HOME/zinit"
# Exactly the plugins ~/.zshrc loads; `_local---zinit` is zinit's own completion.
installed=$(ls "$zinit_home/plugins" | grep -vx '_local---zinit' | tr '\n' ' ')
expected="zdharma-continuum---fast-syntax-highlighting zthxxx---jovial "
[ "$installed" = "$expected" ] ||
	fail "zinit installed [$installed], expected [$expected] (the plugins ~/.zshrc loads)"
# oh-my-zsh libs and plugins would arrive as snippet files. zinit itself only creates the empty
# snippets/OMZ::plugins directory and a `plugins` link to it (zinit.zsh, .zinit-prepare-home).
snippets=$(find "$zinit_home/snippets" -type f 2>/dev/null)
[ -z "$snippets" ] || fail "zinit snippet files present: $snippets"
ls -A "$zinit_home" "$zinit_home/plugins"

step "no unwanted tools pulled in as dependencies"
for cmd in node python3 zoxide; do
	! command -v "$cmd" >/dev/null || fail "$cmd is installed ($(command -v "$cmd")), the image must not ship it"
done

step "offline start: no network, no errors"
ip link set eth0 down 2>/dev/null || true
errors=$(zsh -i -c '@zinit-scheduler burst' 2>&1 </dev/null >/dev/null) || fail "zsh -i failed offline: $errors"
[ -z "$errors" ] || fail "zsh -i printed errors offline: $errors"
# The completion dump compiled ahead, so the first terminal skips that work.
zsh -c 'for f in ~/.zcompdump*(N); do [[ $f == *.zwc ]] || zcompile "$f"; done'

step "image stamp"
cat > /etc/terminal-glance-image <<EOF
inputs=${IMAGE_INPUT_HASH:-unknown}
unkernel=${UNKERNEL_VERSION:-unknown}
lower=$(cat /usr/lib/kw-image)
built=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
cat /etc/terminal-glance-image

step "clean caches"
rm -rf /var/cache/apk/* /var/cache/kw-apk "$HOME/.cache" "$HOME/.wget-hsts" \
	"$HOME/.zsh_history" "$HOME/.ash_history" "$HOME/.lesshst" \
	"$XDG_DATA_HOME/zinit/zinit.git/.git/FETCH_HEAD" /tmp/* 2>/dev/null || true
find "$XDG_DATA_HOME/zinit" -name '*.zwc.old' -delete 2>/dev/null || true

step "sizes"
# One du per path: du counts an inode once, so a nested path in the same call would print nothing.
for d in "$OV/upper" "$OV/upper/usr/lib" "$OV/upper/usr/share" "$OV/upper/usr/bin" "$XDG_DATA_HOME/zinit"; do
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
