# 静态博客

## 日常使用（推荐）

在博客目录运行管理后台：

```bash
node admin.js
```

浏览器打开 <http://localhost:4000>，可以：

- **新建 / 编辑 / 删除文章**：表单填标题、日期、标签、摘要，正文写 Markdown，不用手写 frontmatter
- **改站点设置**：站名、简介、作者、域名
- **改文章 URL 格局**（permalink）：可选 `posts/:slug/`、`:year/:month/:slug/`、`:slug/`
- **Giscus 评论**：填 GitHub 仓库名和 ID 后，文章页自动出现评论区（ID 可在 giscus.app 配置向导获取）
- **Cloudflare Web Analytics**：填 token 后自动注入统计脚本
- **编辑关于页**
- **一键构建**：保存后点「构建」，dist/ 即更新，本地预览 http://localhost:4173

## 内置进阶功能（自动生效，无需配置）

- **站内搜索**：`/search/` 页面，客户端全文搜索（索引来自 `search/search.json`）
- **文章目录 TOC**：正文 h2/h3 自动生成锚点和右侧粘性目录（≥2 个标题才显示）
- **代码高亮 + 一键复制**：highlight.js，深浅色主题自动跟随
- **图片懒加载 + 点击放大**（lightbox）
- **阅读统计**：文章页显示预计阅读时长和字数
- **阅读进度条**：文章页顶部
- **上一篇 / 下一篇**导航
- **RSS / Sitemap**：自动包含全部文章和独立页面，中文 slug 自动 URL 编码

## 手动写文章

在 `posts/` 下新建 Markdown 文件（带 frontmatter），然后：

```bash
node build.js   # 构建到 dist/（构建前会自动清空 dist，防止旧文件残留）
```

## frontmatter 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| title | 是 | 文章标题 |
| date | 是 | 发布日期 YYYY-MM-DD |
| tags | 否 | 标签数组，如 `[建站, 教程]` |
| summary | 否 | 摘要，显示在列表和 RSS |
| slug | 否 | 自定义 URL，默认用文件名 |
| draft | 否 | `true` 时不发布 |

## 部署

Cloudflare Pages 设置：

- 构建命令：`node build.js`
- 输出目录：`dist`
- 依赖已在 `package.json` 声明，Cloudflare 构建时会自动 npm install

## 配置

站点名、域名、作者、URL 格局、评论、统计都在 `config.json`，建议通过管理后台修改。

## 目录结构

```
blog/
├── admin.js        # 本地管理后台（node admin.js，端口 4000）
├── build.js        # 生成器脚本
├── config.json     # 站点配置（站名/域名/作者/URL 格局/评论/统计）
├── posts/          # 文章（Markdown）
├── pages/          # 独立页面（关于页等）
├── src/style.css   # 样式
└── dist/           # 构建产物（部署这个）
```
