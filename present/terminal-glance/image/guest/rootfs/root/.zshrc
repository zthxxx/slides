# Root's ~/.zshrc in the terminal-glance guest image.
#
# Source: https://github.com/zthxxx/jovial/blob/master/examples/zinit.zshrc
#   (fetched at jovial c258f5f, release v2.6.1)
# Changed: only the jovial theme and fast-syntax-highlighting are loaded. The
#   example's ohmyzsh libs and plugins, zsh-history-enquirer, zsh-completions
#   and zsh-autosuggestions are left out: under the in-browser VM each of them
#   adds to the time before the first prompt. Everything kept is upstream's.
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


## https://github.com/zdharma-continuum/fast-syntax-highlighting
zinit light-mode depth=1 wait lucid for \
    atinit="ZINIT[COMPINIT_OPTS]=-C" \
        zdharma-continuum/fast-syntax-highlighting
