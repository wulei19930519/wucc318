---
title: 用 Cloudflare Pages 部署博客的完整流程
date: 2026-11-05
tags: [建站, 教程]
summary: 从 GitHub 仓库到自定义域名上线，手把手走一遍 Cloudflare Pages 的部署流程，全程免费。
---

这篇记录一下把博客部署到 Cloudflare Pages 的完整流程，之后换主题、发新文章都走同一条路。

## 前置准备

- 一个 GitHub 账号，新建一个仓库（比如 `blog`）
- 一个托管在 Cloudflare 的域名

## 部署步骤

### 1. 推送代码到 GitHub

```bash
git init
git add .
git commit -m "init blog"
git remote add origin git@github.com:你的用户名/blog.git
git push -u origin main
```

### 2. 连接 Cloudflare Pages

1. 打开 Cloudflare 控制台 → **Workers & Pages** → **Create**
2. 选择 **Pages** → **Connect to Git**，授权并选中刚才的仓库
3. 构建设置：
   - 构建命令：`node build.js`（或者干脆留空，把 dist 提交进仓库）
   - 输出目录：`dist`

### 3. 绑定自定义域名

项目创建完成后：

- 进入项目 → **Custom domains** → **Set up a custom domain**
- 输入你的域名（如 `blog.example.com`），因为域名 DNS 就在 Cloudflare，会自动添加 CNAME 记录
- 几分钟内 HTTPS 证书自动签发完成

### 4. 自动发布

之后每次写作流程：

```bash
# 写一篇新文章 posts/xxx.md
node build.js   # 本地预览确认
git add . && git commit -m "new post" && git push
```

push 之后 Cloudflare 会自动构建并上线，Pull Request 还会生成预览链接。

## 常见问题

- **构建失败**：检查 Node 版本，Pages 默认 Node 版本可以在项目 Settings 里指定
- **国内访问慢**：Cloudflare 免费版走的是国际节点，速度看线路，一般可用
- **缓存不更新**：静态资源默认带缓存，发布新版本后会自动刷新

## 成本

0 元。Pages 不限流量、每月 500 次构建额度，对个人博客绰绰有余。
