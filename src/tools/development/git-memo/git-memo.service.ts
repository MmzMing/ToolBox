export interface GitMemoItem {
  /** git 命令（展示与复制用） */
  command: string
  /** i18n 键：tools-development 命名空间下 git-memo.<descriptionKey> */
  descriptionKey: string
}

export interface GitMemoGroup {
  id: string
  items: GitMemoItem[]
}

function item(command: string, key: string): GitMemoItem {
  return { command, descriptionKey: `item-${key}` }
}

/** Git 常用命令速查静态数据：新建仓库 / 基础快照 / 分支合并 / 远程 / 撤销 / 历史 / 标签 / stash */
export const gitMemoGroups: readonly GitMemoGroup[] = [
  {
    id: 'create',
    items: [
      item('git init', 'init'),
      item('git clone <url>', 'clone'),
      item('git clone -b <branch> <url>', 'clone-branch'),
      item('git config user.name "<name>"', 'config-name'),
      item('git config user.email "<email>"', 'config-email'),
    ],
  },
  {
    id: 'snapshot',
    items: [
      item('git status', 'status'),
      item('git add <file>', 'add'),
      item('git add .', 'add-all'),
      item('git commit -m "<message>"', 'commit'),
      item('git commit --amend', 'commit-amend'),
      item('git diff', 'diff'),
      item('git diff --staged', 'diff-staged'),
      item('git rm <file>', 'rm'),
      item('git mv <old> <new>', 'mv'),
    ],
  },
  {
    id: 'branch',
    items: [
      item('git branch', 'branch-list'),
      item('git branch <name>', 'branch-create'),
      item('git switch <name>', 'switch'),
      item('git switch -c <name>', 'switch-create'),
      item('git merge <name>', 'merge'),
      item('git merge --abort', 'merge-abort'),
      item('git branch -d <name>', 'branch-delete'),
      item('git branch -m <old> <new>', 'branch-rename'),
      item('git cherry-pick <commit>', 'cherry-pick'),
      item('git rebase <base>', 'rebase'),
    ],
  },
  {
    id: 'remote',
    items: [
      item('git remote -v', 'remote-list'),
      item('git remote add origin <url>', 'remote-add'),
      item('git fetch', 'fetch'),
      item('git fetch --prune', 'fetch-prune'),
      item('git pull', 'pull'),
      item('git pull --rebase', 'pull-rebase'),
      item('git push', 'push'),
      item('git push -u origin <branch>', 'push-upstream'),
      item('git push --force-with-lease', 'push-force-lease'),
      item('git push origin --delete <branch>', 'push-delete'),
    ],
  },
  {
    id: 'undo',
    items: [
      item('git restore <file>', 'restore'),
      item('git restore --staged <file>', 'restore-staged'),
      item('git reset --soft HEAD~1', 'reset-soft'),
      item('git reset --hard HEAD~1', 'reset-hard'),
      item('git reset --hard origin/<branch>', 'reset-origin'),
      item('git revert <commit>', 'revert'),
      item('git clean -fd', 'clean'),
    ],
  },
  {
    id: 'history',
    items: [
      item('git log', 'log'),
      item('git log --oneline', 'log-oneline'),
      item('git log --graph --oneline --all', 'log-graph'),
      item('git log -p <file>', 'log-file'),
      item('git show <commit>', 'show'),
      item('git blame <file>', 'blame'),
      item('git reflog', 'reflog'),
    ],
  },
  {
    id: 'tags',
    items: [
      item('git tag', 'tag-list'),
      item('git tag <name>', 'tag-create'),
      item('git tag -a <name> -m "<message>"', 'tag-annotate'),
      item('git show <tag>', 'tag-show'),
      item('git push origin <tag>', 'tag-push'),
      item('git push --tags', 'tag-push-all'),
      item('git tag -d <name>', 'tag-delete'),
    ],
  },
  {
    id: 'stash',
    items: [
      item('git stash', 'stash'),
      item('git stash push -m "<message>"', 'stash-message'),
      item('git stash -u', 'stash-include-untracked'),
      item('git stash list', 'stash-list'),
      item('git stash pop', 'stash-pop'),
      item('git stash apply', 'stash-apply'),
      item('git stash drop', 'stash-drop'),
      item('git stash branch <name>', 'stash-branch'),
    ],
  },
]
