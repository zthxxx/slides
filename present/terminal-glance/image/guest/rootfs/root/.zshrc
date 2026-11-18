# Root's ~/.zshrc in the terminal-glance guest image.
#
# Source: https://github.com/zthxxx/jovial/blob/master/examples/zinit.zshrc
#   (fetched at jovial c258f5f, release v2.6.1)
# Changed: only the jovial theme and fast-syntax-highlighting are loaded. The
#   example's ohmyzsh libs and plugins, zsh-history-enquirer, zsh-completions
#   and zsh-autosuggestions are left out: under the in-browser VM each of them
#   adds to the time before the first prompt. Everything kept is upstream's,
#   plus FAST_WORK_DIR for fast-syntax-highlighting.
#
# The image is provisioned with network, so zinit clones zinit and jovial at
# build time (image/guest/setup.sh); the page boots offline and only loads them.

# the example `~/.zshrc` for jovial + zinit
#
# Usage:
# 
#    curl -SL https://github.com/zthxxx/jovial/raw/master/examples/zinit.zshrc -o ~/.zshrc
#


# ----------------------------------------------- #
#                  Common Config                  #
# ----------------------------------------------- #
autoload -Uz compinit && compinit

# https://wiki.archlinux.org/title/XDG_Base_Directory
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-${HOME}/.config}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}"



# ----------------------------------------------- #
#                     PATH                        #
# ----------------------------------------------- #
export PATH="/usr/local/bin:$PATH"



# ----------------------------------------------- #
#                  ZSH Config                     #
# ----------------------------------------------- #

# zsh 5.9 zshparam(1), PS2/RPS2: keep multiline demos free of parser-context prompts.
PS2=''
RPS2=''


# Zinit
#
# https://zdharma-continuum.github.io/zinit/wiki/
#
### Added by Zinit's installer
#
ZINIT_HOME="${XDG_DATA_HOME}/zinit/zinit.git"
if [[ ! -f ${ZINIT_HOME}/zinit.zsh ]]; then
    print -P "%F{33}▓▒░ %F{220} Installing %F{33}ZDHARMA-CONTINUUM%F{220} Initiative Plugin Manager (%F{33}zdharma-continuum/zinit%F{220})…%f"
    command mkdir -p "${XDG_DATA_HOME}/zinit" && command chmod g-rwX "${XDG_DATA_HOME}/zinit"
    command git clone --filter=tree:0 https://github.com/zdharma-continuum/zinit "${ZINIT_HOME}" && \
        print -P "%F{33}▓▒░ %F{34} Installation successful.%f%b" || \
        print -P "%F{160}▓▒░  The clone has failed.%f%b"
fi

source "${ZINIT_HOME}/zinit.zsh"
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit


zinit light-mode depth=1 multisrc='*.plugin.zsh' for zthxxx/jovial


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
zinit light-mode depth=1 wait lucid for \
    atinit="ZINIT[COMPINIT_OPTS]=-C" \
    atload=".terminal-glance-mark cGx1Z2lucw==" \
        zdharma-continuum/fast-syntax-highlighting


## Start-up marks for image/vm/trace-boot.ts, which records what the boot reads from the disk (docs/image.md).
# iTerm2's SetUserVar escape (OSC 1337), the usual way for a shell to signal its terminal; terminals that do not
# know it ignore it, so nothing shows. `prompt` is sent once, from the last precmd hook before the first prompt;
# `plugins` once the turbo (wait) loads above have run. The values are base64, as SetUserVar requires, written out
# so that the boot runs no extra process: cHJvbXB0 is `prompt`, cGx1Z2lucw== is `plugins`. Only to a terminal: a
# `zsh -i -c` whose output is captured (image/guest/setup.sh) must not get them in its output.
.terminal-glance-mark() {
    [[ -t 1 ]] && print -n "\e]1337;SetUserVar=terminal_glance_boot=$1\a"
}
.terminal-glance-first-prompt() {
    add-zsh-hook -d precmd .terminal-glance-first-prompt
    .terminal-glance-mark cHJvbXB0
}
autoload -Uz add-zsh-hook
add-zsh-hook precmd .terminal-glance-first-prompt
