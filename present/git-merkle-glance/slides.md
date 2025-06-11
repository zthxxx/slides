---
theme: eloc
routerMode: hash
---

## A Glance at Git

The 'blockchain' you are most familiar with

---

### TOC

- Block chain Merkle Tree
- Why is git not considered a 'block chain'
- Git Workspace / Data Structure
- Low-level Usage (Porcelain & Plumbing)
- merge / squash / rebase / subtree
- Useful configuration

---

![base-merkle-tree](/images/merkle-tree.png)

[Merkle Tree](https://en.wikipedia.org/wiki/Merkle_tree)

<style>
  .slidev-layout {
    p {
      margin-block: 0;
    }
    img {
      width: 1000px;
    }
  }
</style>

<!-- 区块链的背后是 Merkle hash 树 -->

---

![git-merkle](/images/git-merkle-tree-full.png)

<!-- 而这和 git 是一样的 -->

---

![bitcoin-block-chain-thum](/images/bitcoin-block-chain-thum.png)

<!-- 再看区块链「链」的组成 -->

---

![bitcoin-block](/images/bitcoin-block.png)

<!-- 每个 block 里面就是 Merkle tree -->

---

![bitcoin-block-chain-full](/images/bitcoin-block-chain-thum.png)

---

### https://bitcoin.org/bitcoin.pdf

Block Sign Chain / PoW / [Difficulty](https://learnmeabitcoin.com/beginners/difficulty) / Block Reward

Smart Contract (eg. ETH) / IPO (eg. ETH)

---

![blockchain-merkle](/images/merkle-tree-top-blockchain-interview-questions-edureka.png)

---

![git-merkle](/images/git-merkle-tree-full.png)

---

### [Why is git **NOT** considered a 'block chain'](https://stackoverflow.com/questions/46192377/why-is-git-not-considered-a-block-chain)

---

### Why is git considered a 'block chain'

hash block / signature / merkle

<!-- similarity -->

---

### [Why is git not considered a 'block chain'](https://stackoverflow.com/questions/46192377/why-is-git-not-considered-a-block-chain)

Block Sign Chain / PoW / [Difficulty](https://learnmeabitcoin.com/beginners/difficulty)

Block Reward / Smart Contract (eg. ETH) / IPO (eg. ETH)

*trust, financial*

---

![git-merkle](/images/git-merkle-tree-full.png)

<!-- 再看这个树，具体的 merkle tree 在哪儿 -->

---

![git-merkle-block](/images/git-merkle-tree-block.png)

<!--
这就是这棵树了，我们马上讲到
-->

---

![git-workspace](/images/git-workspace.png)

<!--
这次的主题范围里，先不聊往下的 git push 到 remote repository，
也不聊 stash area 的概念，
-->

---

![git-workdir-commit](/images/git-workdir-commit.png)

---

![](/images/git-commit-data.png)

---


![](/images/git-tree-data.png)

---

![](/images/git-blob-data.png)

---

![git-min-commit](/images/git-min-commit.png)
![git-workspace](/images/git-workspace.png)

<style>
  p {
    @apply flex justify-center items-center;

    img {
      @apply max-w-3/5 max-h-4/5;
    }
  }
</style>

---

### The Essentially What Git Does

- stores **blobs** for the **files** that have changed,
- updates the **index**, writes out **trees**,
- writes **commit** objects that reference the top-level **trees** and the commits.

---

### [Plumbing & Porcelain](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)

```bash
# Porcelain: user-friendly commands
# Plumbing: low-level commands

git cat-file # provide content or type info for repository objects
git hash-object # compute hash and creates a blob from a file
git update-index # register files in the working tree to the index
git write-tree # create a tree object from the current index
git commit-tree # create a commit object from tree object
git update-ref # update the object name stored in a ref safely
```

---

```bash
# git add README.md && git commit -m 'docs: update README'

# git add
## note snapshot

blob_hash=$(git hash-object -w README.md)

## 100644: file; 100755: exec; 120000: symbolic-link
git update-index --add --cacheinfo 100644 ${blob_hash} README.md

# git commit

tree_hash=$(git write-tree)

commit_hash=$(git commit-tree ${tree_hash} -p 'HEAD^{commit}' -m 'docs: update README')

git update-ref refs/heads/master ${commit_hash}
## echo ${commit_hash} > .git/refs/heads/master
```

---

```bash
git update-index --add --cacheinfo 100644 \
  $(git hash-object -w README.md) README.md

git update-ref refs/heads/master $(
  git commit-tree $(git write-tree) -p 'HEAD^{commit}' -m 'use commit-tree'
)
```

---

![](/images/git-checkout-stage.png)

---

```bash
# git checkout README.md
git read-tree HEAD^{tree}
git checkout-index -f README.md

# dev; git checkout master
git symbolic-ref HEAD refs/heads/master
git read-tree HEAD^{tree}
git checkout-index -f -a
```

---

```bash
# git reset HEAD

git read-tree HEAD^{tree}

# git reset HEAD --hard

git read-tree HEAD^{tree}
git checkout-index -f -a
```

---

```bash
# on dev
git checkout master
git pull


git fetch origin +master:refs/heads/master
git checkout master


# or
git fetch origin master
git fetch . origin/master:master
git checkout master
```

---

```bash
git fetch . +370bac699cfe2eeee6517991ed8c1dcaef50bf39:refs/heads/release
# is equivalent to
git update-ref refs/heads/release 370bac699cfe2eeee6517991ed8c1dcaef50bf39

git fetch . +HEAD:refs/heads/test-fetch-new-branch # `+` means force update
# is equivalent to
git checkout -b test-fetch-new-branch
git update-ref refs/heads/test-fetch-new-branch HEAD
```

---

### [git-block-playground](https://docs.google.com/presentation/d/1sbYcDZV-_3a_1Yw9WxMiJZFgQJo6ZlD47Y-8lmKowFM/edit?usp=sharing)

(merge / rebase / squash / subtree)

---

### Reference

- [bitcoin.org/bitcoin.pdf](https://bitcoin.org/bitcoin.pdf)
- [git-scm.com/Git-Internals-Plumbing-and-Porcelain](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)
- [github.com/pluralsight/git-internals](https://github.com/pluralsight/git-internals-pdf)
- [why-is-git-not-considered-a-block-chain](https://stackoverflow.com/questions/46192377/why-is-git-not-considered-a-block-chain)
- [git-cheatsheet-chs](https://amio.github.io/git-cheatsheet-chs/)

---

<a href="https://github.com/zthxxx" target="_blank" rel="noopener">
  <img
    alt="zthxxx"
    src="https://avatars.githubusercontent.com/u/15135943"
    class="w-52 h-52 rounded-full border-2 border-gray-300"
  />
</a>

[![zthxxx](https://badgen.net/badge/github/zthxxx/blue?icon=github&label&scale=2)](https://github.com/zthxxx)

[ [jovial](https://github.com/zthxxx/jovial) · [zsh-history-enquirer](https://github.com/zthxxx/zsh-history-enquirer) · [hexo-wikitten](https://github.com/zthxxx/hexo-theme-Wikitten) ]
