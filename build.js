/**
 * 轻量静态博客生成器
 * 用法: node build.js
 * 输入: posts/*.md (含 frontmatter), pages/, src/style.css
 * 输出: dist/  (可直接部署到 Cloudflare Pages)
 *
 * 进阶功能: 站内搜索 / 文章目录 TOC / 代码高亮+复制 / 图片懒加载+点击放大 /
 *           阅读时长统计 / 阅读进度条 / Giscus 评论 / Cloudflare Web Analytics
 */
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const matter = require('gray-matter');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
// 规范化站点域名，避免拼接出 //
config.url = String(config.url || '').replace(/\/+$/, '');

marked.setOptions({ breaks: true });

/* ---------- 工具 ---------- */
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const stripTags = (html) => html.replace(/<[^>]+>/g, '');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function write(rel, content) {
  const file = path.join(DIST, rel);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
  console.log('  +', rel);
}

function fmtDate(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/* 阅读统计：中文字符按 400/分钟，英文按 200 词/分钟 */
function readingStats(html) {
  const text = stripTags(html);
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latin = (text.match(/[a-zA-Z0-9]+/g) || []).length;
  const minutes = Math.max(1, Math.ceil((cjk + latin * 2) / 400));
  return { minutes, words: cjk + latin };
}

/* 给 h2/h3 加锚点 id，同时抽出目录 */
function processHeadings(html) {
  const toc = [];
  let i = 0;
  const out = html.replace(/<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g, (m, lvl, attrs, inner) => {
    const text = stripTags(inner).trim();
    const id = 'h-' + (++i);
    toc.push({ level: +lvl, text, id });
    return `<h${lvl} id="${id}"${attrs || ''}>${inner}</h${lvl}>`;
  });
  return { html: out, toc };
}

function tocHtml(toc) {
  if (toc.length < 2) return '';
  return `<aside class="toc"><div class="toc-title">目录</div><nav class="toc-list">${
    toc.map(t => `<a class="lvl${t.level}" href="#${t.id}">${esc(t.text)}</a>`).join('')
  }</nav></aside>`;
}

/* ---------- 读取文章 ---------- */
const posts = [];
for (const f of fs.readdirSync(path.join(ROOT, 'posts')).filter(f => f.endsWith('.md'))) {
  const raw = fs.readFileSync(path.join(ROOT, 'posts', f), 'utf8');
  const { data, content } = matter(raw);
  if (data.draft) continue;
  const slug = data.slug || f.replace(/\.md$/, '');
  const rendered = marked.parse(content);
  const { html, toc } = processHeadings(rendered);
  // 图片懒加载
  const lazyHtml = html.replace(/<img /g, '<img loading="lazy" ');
  posts.push({
    title: data.title || slug,
    slug,
    date: new Date(data.date || Date.now()),
    tags: data.tags || [],
    summary: data.summary || '',
    html: lazyHtml,
    toc,
    stats: readingStats(rendered),
    text: stripTags(rendered).replace(/\s+/g, ' ').slice(0, 3000), // 搜索索引用
  });
}
posts.sort((a, b) => b.date - a.date);

const allTags = {};
for (const p of posts) for (const t of p.tags) (allTags[t] = allTags[t] || []).push(p);

/* ---------- URL 格局（config.permalink，支持 :slug :year :month :day） ---------- */
function postUrl(p) {
  const pad = (n) => String(n).padStart(2, '0');
  const pat = config.permalink || 'posts/:slug/';
  return '/' + pat
    .replace(':year', p.date.getFullYear())
    .replace(':month', pad(p.date.getMonth() + 1))
    .replace(':day', pad(p.date.getDate()))
    .replace(':slug', p.slug);
}

/* ---------- 读取独立页面 ---------- */
function loadPage(file) {
  const raw = fs.readFileSync(path.join(ROOT, 'pages', file), 'utf8');
  const { data, content } = matter(raw);
  return { title: data.title, html: marked.parse(content) };
}
const aboutPage = loadPage('about.md');

/* ---------- 模板 ---------- */
const nav = (active) => `
  <nav class="nav">
    <a class="brand" href="/">${esc(config.name)}</a>
    <div class="links">
      <a href="/" class="${active === 'home' ? 'on' : ''}">首页</a>
      <a href="/archives/" class="${active === 'archives' ? 'on' : ''}">归档</a>
      <a href="/tags/" class="${active === 'tags' ? 'on' : ''}">标签</a>
      <a href="/search/" class="${active === 'search' ? 'on' : ''}">搜索</a>
      <a href="/about/" class="${active === 'about' ? 'on' : ''}">关于</a>
      <button id="theme-toggle" aria-label="切换主题" title="切换深浅色">◐</button>
    </div>
  </nav>`;

/* Giscus 评论（配置了 repo 才启用） */
function giscusSnippet() {
  const g = config.giscus || {};
  if (!g.repo) return '';
  return `<section class="comments"><h2>评论</h2>
<script src="https://giscus.app/client.js"
  data-repo="${esc(g.repo)}"
  data-repo-id="${esc(g.repoId || '')}"
  data-category="${esc(g.category || 'Announcements')}"
  data-category-id="${esc(g.categoryId || '')}"
  data-mapping="pathname" data-strict="0" data-reactions-enabled="1"
  data-emit-metadata="0" data-input-position="top" data-theme="preferred_color_scheme"
  data-lang="zh-CN" data-loading="lazy" crossorigin="anonymous" async>
</script></section>`;
}

function layout({ title, desc, active = '', body, absUrl = '', isPost = false, hasToc = false }) {
  const fullTitle = title ? `${title} · ${config.name}` : config.name;
  const description = esc(desc || config.bio);
  const url = config.url + absUrl;
  const analytics = config.analyticsToken
    ? `\n<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${esc(config.analyticsToken)}"}'></script>`
    : '';
  const hljs = isPost ? `
<link id="hl-light" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
<link id="hl-dark" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>` : '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="${isPost ? 'article' : 'website'}">
<meta property="og:url" content="${url}">
<link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
<link rel="stylesheet" href="/style.css">
${hljs}
<script>
(function () {
  var t = localStorage.getItem('theme');
  if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();
</script>
</head>
<body>
${nav(active)}
<main class="wrap${hasToc ? ' wide' : ''}">
${body}
</main>
<footer class="foot">
  <span>© ${new Date().getFullYear()} ${esc(config.author)}</span>
  <span class="dot">·</span>
  <a href="/feed.xml">RSS</a>
  <span class="dot">·</span>
  <a href="/sitemap.xml">Sitemap</a>
</footer>
<script>
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
}
document.getElementById('theme-toggle').addEventListener('click', function () {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});
function syncHlTheme() {
  var dark = document.documentElement.getAttribute('data-theme') === 'dark';
  var l = document.getElementById('hl-light'), d = document.getElementById('hl-dark');
  if (l && d) { l.disabled = dark; d.disabled = !dark; }
}
syncHlTheme();
</script>
${isPost ? `<script>
/* 代码一键复制 */
document.querySelectorAll('.prose pre').forEach(function (pre) {
  pre.style.position = 'relative';
  var btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.type = 'button';
  btn.textContent = '复制';
  btn.addEventListener('click', function () {
    navigator.clipboard.writeText(pre.innerText.replace(/^复制\\n/, '')).then(function () {
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = '复制'; }, 1500);
    });
  });
  pre.appendChild(btn);
});
/* 图片点击放大 */
var lb = document.createElement('div');
lb.id = 'lightbox';
lb.innerHTML = '<img alt="">';
document.body.appendChild(lb);
lb.addEventListener('click', function () { lb.classList.remove('show'); });
document.querySelectorAll('.prose img').forEach(function (img) {
  img.addEventListener('click', function () {
    lb.querySelector('img').src = img.src;
    lb.classList.add('show');
  });
});
/* 阅读进度条 */
var bar = document.createElement('div');
bar.id = 'progress';
document.body.appendChild(bar);
addEventListener('scroll', function () {
  var h = document.documentElement;
  var pct = h.scrollTop / (h.scrollHeight - h.clientHeight) * 100;
  bar.style.width = pct + '%';
}, { passive: true });
/* 代码高亮 */
addEventListener('load', function () {
  if (window.hljs) hljs.highlightAll();
});
</script>` : ''}
${isPost ? giscusSnippet() : ''}
${analytics}
</body>
</html>`;
}

function postCard(p) {
  return `<article class="card">
  <a class="card-title" href="${postUrl(p)}">${esc(p.title)}</a>
  <div class="meta"><time datetime="${p.date.toISOString()}">${fmtDate(p.date)}</time>${p.tags.map(t => ` <a class="tag" href="/tags/${encodeURIComponent(t)}/">#${esc(t)}</a>`).join('')}</div>
  ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ''}
</article>`;
}

/* ---------- 生成页面 ---------- */
console.log('Building...');

// 清空 dist 内容（不删目录本身，避免占用冲突），防止 permalink 切换后旧路径残留
if (fs.existsSync(DIST)) {
  for (const e of fs.readdirSync(DIST)) {
    fs.rmSync(path.join(DIST, e), { recursive: true, force: true });
  }
}
ensureDir(DIST);

// 首页
write('index.html', layout({
  active: 'home',
  absUrl: '/',
  body: `
  <section class="hero">
    <h1>${esc(config.name)}</h1>
    <p>${esc(config.bio)}</p>
  </section>
  ${posts.map(postCard).join('\n')}
`}));

// 文章页（双栏：正文 + TOC）
posts.forEach((p, idx) => {
  const newer = posts[idx - 1];
  const older = posts[idx + 1];
  const navLinks = [
    newer ? `<a href="${postUrl(newer)}">← 较新一篇：${esc(newer.title)}</a>` : '',
    older ? `<a href="${postUrl(older)}">较旧一篇：${esc(older.title)} →</a>` : '',
  ].filter(Boolean).join('');
  const toc = tocHtml(p.toc);
  write(`${postUrl(p)}index.html`.replace(/^\//, ''), layout({
    title: p.title,
    desc: p.summary,
    absUrl: postUrl(p),
    isPost: true,
    hasToc: !!toc,
    body: `
  <div class="post-layout${toc ? '' : ' no-toc'}">
  <div class="post-col">
  <article class="post">
    <h1>${esc(p.title)}</h1>
    <div class="meta"><time datetime="${p.date.toISOString()}">${fmtDate(p.date)}</time><span class="stat">约 ${p.stats.minutes} 分钟 · ${p.stats.words} 字</span>${p.tags.map(t => ` <a class="tag" href="/tags/${encodeURIComponent(t)}/">#${esc(t)}</a>`).join('')}</div>
    <div class="prose">${p.html}</div>
  </article>
  <div class="post-nav">${navLinks}</div>
  </div>
  ${toc}
  </div>
`}));
});

// 标签页
write('tags/index.html', layout({
  title: '标签',
  active: 'tags',
  absUrl: '/tags/',
  body: `<h1 class="page-title">标签</h1><div class="tag-cloud">${Object.keys(allTags).sort().map(t =>
    `<a class="tag" href="/tags/${encodeURIComponent(t)}/">#${esc(t)} <sup>${allTags[t].length}</sup></a>`).join('')}</div>`,
}));
for (const [t, list] of Object.entries(allTags)) {
  write(`tags/${encodeURIComponent(t)}/index.html`, layout({
    title: `#${t}`,
    active: 'tags',
    absUrl: `/tags/${encodeURIComponent(t)}/`,
    body: `<h1 class="page-title">#${esc(t)}</h1>${list.map(postCard).join('\n')}`,
  }));
}

// 归档页
const byYear = {};
for (const p of posts) (byYear[p.date.getFullYear()] = byYear[p.date.getFullYear()] || []).push(p);
write('archives/index.html', layout({
  title: '归档',
  active: 'archives',
  absUrl: '/archives/',
  body: `<h1 class="page-title">归档 <small>共 ${posts.length} 篇</small></h1>` +
    Object.keys(byYear).sort((a, b) => b - a).map(y => `
  <section class="year">
    <h2>${y}</h2>
    ${byYear[y].map(p => `<div class="arc-item"><time>${fmtDate(p.date)}</time><a href="${postUrl(p)}">${esc(p.title)}</a></div>`).join('')}
  </section>`).join(''),
}));

// 搜索页（客户端全文搜索，索引来自 search.json）
write('search/index.html', layout({
  title: '搜索',
  active: 'search',
  absUrl: '/search/',
  body: `
  <h1 class="page-title">搜索</h1>
  <input type="search" id="search-input" placeholder="输入关键词，回车搜索…" autocomplete="off">
  <div id="search-results"></div>
  <script>
  (function () {
    var idx = null;
    var input = document.getElementById('search-input');
    var box = document.getElementById('search-results');
    function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    input.addEventListener('input', doSearch);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
    fetch('/search/search.json').then(function (r) { return r.json(); }).then(function (data) { idx = data; if (input.value) doSearch(); });
    function doSearch() {
      if (!idx) return;
      var q = input.value.trim().toLowerCase();
      if (!q) { box.innerHTML = ''; return; }
      var terms = q.split(/\\s+/);
      var hits = idx.filter(function (p) {
        var hay = (p.title + ' ' + p.summary + ' ' + p.text + ' ' + p.tags.join(' ')).toLowerCase();
        return terms.every(function (t) { return hay.indexOf(t) !== -1; });
      }).slice(0, 20);
      box.innerHTML = hits.length
        ? '<p class="search-count">找到 ' + hits.length + ' 篇</p>' + hits.map(function (p) {
            var pos = p.text.toLowerCase().indexOf(terms[0]);
            var frag = pos >= 0 ? '…' + esc(p.text.slice(Math.max(0, pos - 30), pos + 80)) + '…' : esc(p.summary);
            return '<article class="card"><a class="card-title" href="' + p.url + '">' + esc(p.title) + '</a><p class="summary">' + frag + '</p></article>';
          }).join('')
        : '<p class="search-count">没有找到相关文章</p>';
    }
  })();
  </script>
`}));

// 搜索索引
write('search/search.json', JSON.stringify(posts.map(p => ({
  title: p.title,
  url: postUrl(p),
  summary: p.summary,
  tags: p.tags,
  date: fmtDate(p.date),
  text: p.text,
}))));

// 关于页
write('about/index.html', layout({
  title: '关于',
  active: 'about',
  absUrl: '/about/',
  body: `<h1 class="page-title">${esc(aboutPage.title || '关于')}</h1><div class="prose">${aboutPage.html}</div>`,
}));

// 404
write('404.html', layout({
  title: '页面不存在',
  body: `<div class="notfound"><h1>404</h1><p>页面不存在，<a href="/">回到首页</a>。</p></div>`,
}));

// 样式
write('style.css', fs.readFileSync(path.join(ROOT, 'src', 'style.css'), 'utf8'));

// RSS
const escXml = (s) => esc(s);
const buildDate = new Date().toUTCString();
write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${escXml(config.name)}</title>
<link>${config.url}</link>
<description>${escXml(config.bio)}</description>
<language>zh-CN</language>
<lastBuildDate>${buildDate}</lastBuildDate>
${posts.slice(0, 20).map(p => `<item>
<title>${escXml(p.title)}</title>
<link>${config.url}${encodeURI(postUrl(p))}</link>
<guid>${config.url}${encodeURI(postUrl(p))}</guid>
<pubDate>${p.date.toUTCString()}</pubDate>
<description>${escXml(p.summary)}</description>
</item>`).join('\n')}
</channel></rss>`);

// Sitemap
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${config.url}/</loc></url>
${posts.map(p => `<url><loc>${config.url}${encodeURI(postUrl(p))}</loc><lastmod>${p.date.toISOString().slice(0, 10)}</lastmod></url>`).join('\n')}
<url><loc>${config.url}/archives/</loc></url>
<url><loc>${config.url}/tags/</loc></url>
<url><loc>${config.url}/search/</loc></url>
<url><loc>${config.url}/about/</loc></url>
</urlset>`);

console.log(`Done. ${posts.length} posts, ${Object.keys(allTags).length} tags -> dist/`);
