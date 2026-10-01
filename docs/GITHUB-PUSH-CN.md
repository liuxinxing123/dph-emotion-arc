# GitHub 推送操作手册（用户 3 分钟版）

> 前置：你决定公开/私有仓库后，按下面 1-2-3 执行。我无法代替你登录 GitHub。

## 1. 在 github.com 建仓库

- 登录 → New repository → 名称 `dph-emotion-arc` → 公开（推荐，作品集定位）或私有 → **不要**勾选初始化 README/gitignore（本地已有）。

## 2. 把身份改成你自己 + 推送（在本机终端执行）

```powershell
cd "C:\Users\Admin\Desktop\素材\dph-emotion-arc"
git config user.name  "<你的 GitHub 用户名>"
git config user.email "<你的 GitHub 邮箱>"

# 历史里已有一次中性身份的提交，重写为你的身份（全新仓库，无害）：
git commit --amend --reset-author --no-edit

git remote add origin https://github.com/<用户名>/dph-emotion-arc.git
git push -u origin master
```

> 推送时按提示登录 GitHub（浏览器授权或 Token）。

## 3. 打版本 tag（供插件市场引用）

```powershell
git tag v0.2.0
git push origin v0.2.0
```

## 完成后告诉我

我会立即接着做：① awesome-deepseek-harness 的 PR 收录 ② dsh.so 提交 ③ 发布小红书首发篇（挂仓库链接）。
