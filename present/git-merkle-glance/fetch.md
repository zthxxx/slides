git fetch to LATEST branch's commit

```bash
gfco () {
    : 'git fetch and checkout to target branch'
    local branch="$1"
    git fetch ${GIT_REMOTE:-origin} --no-tags --update-head-ok +${branch}:${branch} \
      && git switch ${branch} \
      && git submodule update --init --recursive
}
```
