# Root's ~/.zshrc in the terminal-glance guest image.
#
# Loads the jovial theme as jovial's README installs it without a plugin manager ("Manually Install Without
# oh-my-zsh": `source jovial.zsh-theme`, https://github.com/zthxxx/jovial#manually-install-without-oh-my-zsh), with
# its jovial.plugin.zsh, and fast-syntax-highlighting right after the first prompt. image/guest/setup.sh clones both
# at build time; the page boots offline.
#
# No plugin manager and no completion system: in the VM a zsh statement takes about 30 µs, and zinit (sourcing it,
# then the wrappers it puts around each autoload, `zle -N` and hook a plugin makes) cost more than all the rest of
# the start, and compinit 50 ms more (docs/image.md, "Shell start time").

# https://wiki.archlinux.org/title/XDG_Base_Directory
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-${HOME}/.config}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}"

export PATH="/usr/local/bin:$PATH"

# zsh 5.9 zshparam(1), PS2/RPS2: keep multiline demos free of parser-context prompts.
PS2=''
RPS2=''

# Where image/guest/setup.sh puts the plugins: not ~/.local/share/zsh/plugins, which Alpine's /etc/zsh/zshrc would
# source before this file.
typeset -g ZSH_PLUGINS_DIR="${XDG_DATA_HOME}/zsh-plugins"

autoload -Uz add-zsh-hook

source "${ZSH_PLUGINS_DIR}/jovial/jovial.zsh-theme"
source "${ZSH_PLUGINS_DIR}/jovial/jovial.plugin.zsh"


## Delete, Home and End. zsh 5.9 binds only the arrow keys by default, and the oh-my-zsh key-bindings that would bind
# these are left out, so zle read Delete's `ESC [ 3 ~` as an undefined key and inserted the `~`. Each key is bound
# in both cursor-key modes, as terminals send it with and without application mode (`smkx`).
bindkey '^[[3~' delete-char
bindkey '^[[H' beginning-of-line '^[OH' beginning-of-line '^[[1~' beginning-of-line
bindkey '^[[F' end-of-line '^[OF' end-of-line '^[[4~' end-of-line


## https://github.com/zdharma-continuum/fast-syntax-highlighting
# While $FAST_WORK_DIR/secondary_theme.zsh is missing, the plugin curls it from GitHub on every
# start (fast-syntax-highlighting.plugin.zsh, zdharma-continuum 4672ad5). The page has no network,
# so the resolver timeout held zsh about 5 s after the first prompt, with typed keys unechoed.
# The default work dir is under ~/.cache, which the image build empties; the image ships the file
# in this one, loading the theme the plugin bundles (share/free_theme.zsh, the file it downloads).
typeset -g FAST_WORK_DIR="${XDG_CONFIG_HOME}/fsh"

.terminal-glance-load-highlighting() {
    source "${ZSH_PLUGINS_DIR}/fast-syntax-highlighting/fast-syntax-highlighting.plugin.zsh"
    .terminal-glance-mark cGx1Z2lucw==
}

# Loading it takes about 0.1 s, and zsh reads no key meanwhile, so it loads once the first prompt shows. zle runs a
# `zle -F` handler when it waits for input; /dev/null is readable at once, so the handler runs as soon as the prompt
# is drawn (the technique of https://github.com/romkatv/zsh-defer). Run as a widget, it then highlights whatever was
# typed before it ran, and keys typed while it runs are read after it, highlighted.
.terminal-glance-highlighting-widget() {
    local fd=$1
    zle -F $fd
    exec {fd}<&-
    .terminal-glance-load-highlighting
    _zsh_highlight
    zle -R
}
zle -N .terminal-glance-highlighting-widget
.terminal-glance-defer-highlighting() {
    add-zsh-hook -d precmd .terminal-glance-defer-highlighting
    local fd
    exec {fd}</dev/null
    zle -F -w $fd .terminal-glance-highlighting-widget
}
add-zsh-hook precmd .terminal-glance-defer-highlighting


## Start-up marks for image/vm/trace-boot.ts, which records what the boot reads from the disk (docs/image.md).
# iTerm2's SetUserVar escape (OSC 1337), the usual way for a shell to signal its terminal; terminals that do not
# know it ignore it, so nothing shows. `prompt` is sent once, from the last precmd hook before the first prompt;
# `plugins` once fast-syntax-highlighting has loaded. The values are base64, as SetUserVar requires, written out
# so that the boot runs no extra process: cHJvbXB0 is `prompt`, cGx1Z2lucw== is `plugins`. Only to a terminal: a
# `zsh -i -c` whose output is captured (image/guest/setup.sh) must not get them in its output.
.terminal-glance-mark() {
    if [[ -t 1 ]]; then
        print -n "\e]1337;SetUserVar=terminal_glance_boot=$1\a"
    fi
}
.terminal-glance-first-prompt() {
    add-zsh-hook -d precmd .terminal-glance-first-prompt
    .terminal-glance-mark cHJvbXB0
}
add-zsh-hook precmd .terminal-glance-first-prompt
