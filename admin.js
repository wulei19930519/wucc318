/**
 * 博客本地管理后台
 * 用法: node admin.js   然后浏览器打开 http://localhost:4000
 * 功能: 文章新建/编辑/删除、站点设置、关于页编辑、一键构建
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const matter = require('gray-matter');

const ROOT = __dirname;
const POSTS = path.join(ROOT, 'posts');
const PAGES = path.join(ROOT, 'pages');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const PORT = 4000;
const NODE = process.execPath;

const read = (f) => fs.readFileSync(f, 'utf8');
const send = (res, code, type, body) => {
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8' });
  res.end(body);
};
const json = (res, code, obj) => send(res, code, 'application/json', JSON.stringify(obj));

/* 安全限制：只允许操作 posts/ 下的 .md 文件 */
function safePostFile(name) {
  if (!name.endsWith('.md')) return null;
  const full = path.join(POSTS, path.basename(name));
  return full.startsWith(POSTS) ? full : null;
}
function safeSlug(s) {
  return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function listPosts() {
  return fs.readdirSync(POSTS).filter(f => f.endsWith('.md')).map(f => {
    const { data } = matter(read(path.join(POSTS, f)));
    return {
      file: f,
      title: data.title || f,
      date: data.date || '',
      tags: data.tags || [],
      summary: data.summary || '',
      draft: !!data.draft,
      slug: data.slug || f.replace(/\.md$/, ''),
    };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/* ---------- API 路由 ---------- */
function api(req, res, url) {
  if (url.pathname === '/api/posts' && req.method === 'GET') {
    return json(res, 200, { posts: listPosts() });
  }

  if (url.pathname === '/api/post' && req.method === 'GET') {
    const file = safePostFile(url.searchParams.get('file'));
    if (!file || !fs.existsSync(file)) return json(res, 404, { error: '文章不存在' });
    const { data, content } = matter(read(file));
    return json(res, 200, {
      file: path.basename(file),
      title: data.title || '', date: data.date || '', tags: (data.tags || []).join(', '),
      summary: data.summary || '', slug: data.slug || '', draft: !!data.draft,
      content,
    });
  }

  if (url.pathname === '/api/save' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        const title = String(d.title || '').trim();
        if (!title) return json(res, 400, { error: '标题不能为空' });
        const tags = String(d.tags || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
        const slug = safeSlug(d.slug) || safeSlug(title);
        const data = {
          title,
          date: d.date || new Date().toISOString().slice(0, 10),
          tags,
          draft: !!d.draft,
        };
        if (d.summary) data.summary = String(d.summary).trim();
        if (d.slug) data.slug = slug;
        const newFile = d.file && safePostFile(d.file)
          ? safePostFile(d.file)
          : path.join(POSTS, slug + '.md');
        // slug 变了就重命名文件（旧文件删除）
        if (d.file && path.basename(newFile) !== d.file) fs.rmSync(path.join(POSTS, d.file));
        fs.writeFileSync(newFile, matter.stringify(String(d.content || ''), data), 'utf8');
        json(res, 200, { ok: true, file: path.basename(newFile) });
      } catch (e) { json(res, 500, { error: e.message }); }
    });
    return;
  }

  if (url.pathname === '/api/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { file } = JSON.parse(body);
        const full = safePostFile(file);
        if (!full || !fs.existsSync(full)) return json(res, 404, { error: '文章不存在' });
        fs.rmSync(full);
        json(res, 200, { ok: true });
      } catch (e) { json(res, 500, { error: e.message }); }
    });
    return;
  }

  if (url.pathname === '/api/config' && req.method === 'GET') {
    return json(res, 200, JSON.parse(read(CONFIG_FILE)));
  }
  if (url.pathname === '/api/config' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const obj = JSON.parse(body);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(obj, null, 2), 'utf8');
        json(res, 200, { ok: true });
      } catch (e) { json(res, 400, { error: 'JSON 格式错误: ' + e.message }); }
    });
    return;
  }

  if (url.pathname === '/api/about' && req.method === 'GET') {
    return json(res, 200, { content: read(path.join(PAGES, 'about.md')) });
  }
  if (url.pathname === '/api/about' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { content } = JSON.parse(body);
        fs.writeFileSync(path.join(PAGES, 'about.md'), String(content), 'utf8');
        json(res, 200, { ok: true });
      } catch (e) { json(res, 500, { error: e.message }); }
    });
    return;
  }

  if (url.pathname === '/api/build' && req.method === 'POST') {
    const r = spawnSync(NODE, [path.join(ROOT, 'build.js')], {
      encoding: 'utf8',
      env: { ...process.env },
    });
    return json(res, r.status === 0 ? 200 : 500, {
      ok: r.status === 0,
      output: (r.stdout || '') + (r.stderr || ''),
    });
  }

  json(res, 404, { error: 'not found' });
}

/* ---------- 管理界面 ---------- */
const UI = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>博客管理后台</title>
<style>
:root { --bg:#f6f5f3; --card:#fff; --text:#2c2c2a; --muted:#777673; --border:#e2e0dc; --accent:#185fa5; }
* { box-sizing:border-box; }
body { margin:0; font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; background:var(--bg); color:var(--text); font-size:15px; }
.layout { display:flex; min-height:100vh; }
.side { width:280px; background:var(--card); border-right:1px solid var(--border); padding:20px; flex-shrink:0; }
.side h1 { font-size:18px; margin:0 0 4px; }
.side .sub { color:var(--muted); font-size:12px; margin-bottom:16px; }
.side a { display:block; color:var(--accent); font-size:13px; margin:8px 0; text-decoration:none; cursor:pointer; }
.post-item { padding:10px 12px; border:1px solid var(--border); border-radius:8px; margin-bottom:8px; cursor:pointer; }
.post-item:hover { border-color:var(--accent); }
.post-item .t { font-weight:600; font-size:14px; }
.post-item .m { color:var(--muted); font-size:12px; }
.badge { background:#fcebeb; color:#a32d2d; border-radius:4px; padding:0 6px; font-size:11px; margin-left:6px; }
.main { flex:1; padding:28px 36px; max-width:860px; }
h2 { margin-top:0; }
label { display:block; font-size:13px; color:var(--muted); margin:14px 0 4px; }
input[type=text], textarea, select { width:100%; border:1px solid var(--border); border-radius:8px; padding:8px 12px; font-size:14px; font-family:inherit; }
textarea { font-family:Consolas,monospace; min-height:340px; line-height:1.6; }
input:focus, textarea:focus { outline:none; border-color:var(--accent); }
.row { display:flex; gap:16px; } .row > div { flex:1; }
.btn { background:var(--accent); color:#fff; border:none; border-radius:8px; padding:9px 20px; font-size:14px; cursor:pointer; margin-top:16px; }
.btn.gray { background:#888780; }
.btn.red { background:#a32d2d; }
.btn.outline { background:none; color:var(--accent); border:1px solid var(--accent); }
.msg { padding:10px 14px; border-radius:8px; margin-top:14px; font-size:13px; display:none; }
.msg.ok { background:#eaf3de; color:#3b6d11; display:block; }
.msg.err { background:#fcebeb; color:#a32d2d; display:block; }
pre.log { background:#1c1c1e; color:#e8e8e6; padding:14px; border-radius:8px; font-size:12px; overflow-x:auto; max-height:400px; }
.hidden { display:none; }
</style></head><body>
<div class="layout">
  <aside class="side">
    <h1>博客管理</h1>
    <div class="sub">保存后记得点「构建」才会更新到 dist/</div>
    <a id="nav-new">＋ 新建文章</a>
    <a id="nav-about">关于页</a>
    <a id="nav-config">站点设置</a>
    <a id="nav-build">构建与部署</a>
    <div style="border-top:1px solid var(--border);margin:14px 0 10px;"></div>
    <div class="sub">全部文章</div>
    <div id="post-list"></div>
  </aside>
  <main class="main">

    <section id="view-edit" class="hidden">
      <h2 id="edit-title">新建文章</h2>
      <label>标题 *</label><input type="text" id="f-title">
      <div class="row">
        <div><label>日期</label><input type="text" id="f-date"></div>
        <div><label>标签（逗号分隔）</label><input type="text" id="f-tags"></div>
      </div>
      <div class="row">
        <div><label>摘要（列表/RSS 显示）</label><input type="text" id="f-summary"></div>
        <div><label>slug（URL，留空用标题）</label><input type="text" id="f-slug"></div>
      </div>
      <label>草稿（勾选后不发布）</label><input type="checkbox" id="f-draft" style="width:auto">
      <label>正文（Markdown）</label>
      <textarea id="f-content" placeholder="支持 Markdown 语法"></textarea>
      <button class="btn" onclick="savePost()">保存</button>
      <button class="btn red" id="btn-del" onclick="deletePost()" style="display:none">删除此文章</button>
      <div class="msg" id="msg-edit"></div>
    </section>

    <section id="view-about" class="hidden">
      <h2>关于页</h2>
      <label>内容（Markdown）</label>
      <textarea id="about-content"></textarea>
      <button class="btn" onclick="saveAbout()">保存</button>
      <div class="msg" id="msg-about"></div>
    </section>

    <section id="view-config" class="hidden">
      <h2>站点设置（config.json）</h2>
      <label>站点名称</label><input type="text" id="c-name">
      <label>站点简介</label><input type="text" id="c-bio">
      <label>作者</label><input type="text" id="c-author">
      <label>线上域名（部署后改成你的域名）</label><input type="text" id="c-url">
      <label>文章 URL 格局</label>
      <select id="c-permalink">
        <option value="posts/:slug/">posts/:slug/（默认，推荐）</option>
        <option value=":year/:month/:slug/">:year/:month/:slug/（按日期分层）</option>
        <option value=":slug/">:slug/（最短，直接挂在根路径）</option>
      </select>
      <label>Cloudflare Web Analytics Token（留空不启用）</label><input type="text" id="c-analytics" placeholder="从 Cloudflare Analytics 页面获取">
      <div class="row">
        <div><label>Giscus 评论 · GitHub 仓库（如 user/repo，留空不启用）</label><input type="text" id="c-grepo"></div>
        <div><label>仓库 ID</label><input type="text" id="c-grepoId"></div>
      </div>
      <div class="row">
        <div><label>Discussion 分类</label><input type="text" id="c-gcat"></div>
        <div><label>分类 ID</label><input type="text" id="c-gcatId"></div>
      </div>
      <button class="btn" onclick="saveConfig()">保存设置</button>
      <div class="msg" id="msg-config"></div>
    </section>

    <section id="view-build" class="hidden">
      <h2>构建与部署</h2>
      <p style="color:var(--muted);font-size:14px">点「立即构建」把 Markdown 生成到 dist/ 目录。
        部署时把 blog/ 目录 push 到 GitHub，Cloudflare Pages 会自动执行构建并发布（构建命令 node build.js，输出目录 dist）。</p>
      <button class="btn" onclick="build()">立即构建</button>
      <pre class="log hidden" id="build-log"></pre>
      <p style="font-size:13px;color:var(--muted);margin-top:20px">本地预览：构建后访问 <a href="http://localhost:4173" target="_blank">http://localhost:4173</a></p>
    </section>

  </main>
</div>
<script>
const $ = (id) => document.getElementById(id);
const show = (id) => { document.querySelectorAll('section').forEach(s => s.classList.add('hidden')); $(id).classList.remove('hidden'); };
const msg = (id, text, ok) => { const el = $(id); el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); };
let currentFile = null;

async function loadList() {
  const r = await (await fetch('/api/posts')).json();
  $('post-list').innerHTML = r.posts.map(p =>
    '<div class="post-item" onclick="editPost(\\'' + p.file.replace(/'/g, "\\\\'") + '\\')">' +
    '<div class="t">' + esc(p.title) + (p.draft ? '<span class="badge">草稿</span>' : '') + '</div>' +
    '<div class="m">' + p.date + '</div></div>').join('');
}
function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function newPost() {
  currentFile = null;
  $('edit-title').textContent = '新建文章';
  $('btn-del').style.display = 'none';
  ['f-title','f-tags','f-summary','f-slug','f-content'].forEach(id => $(id).value = '');
  $('f-date').value = new Date().toISOString().slice(0,10);
  $('f-draft').checked = false;
  show('view-edit');
}
async function editPost(file) {
  const r = await (await fetch('/api/post?file=' + encodeURIComponent(file))).json();
  if (r.error) return alert(r.error);
  currentFile = r.file;
  $('edit-title').textContent = '编辑：' + r.title;
  $('btn-del').style.display = '';
  $('f-title').value = r.title; $('f-date').value = r.date;
  $('f-tags').value = r.tags; $('f-summary').value = r.summary;
  $('f-slug').value = r.slug; $('f-content').value = r.content;
  $('f-draft').checked = r.draft;
  show('view-edit');
}
async function savePost() {
  const body = {
    file: currentFile,
    title: $('f-title').value, date: $('f-date').value, tags: $('f-tags').value,
    summary: $('f-summary').value, slug: $('f-slug').value,
    draft: $('f-draft').checked, content: $('f-content').value,
  };
  const r = await (await fetch('/api/save', {method:'POST', body: JSON.stringify(body)})).json();
  if (r.ok) { currentFile = r.file; msg('msg-edit', '已保存 ✓ 记得点左侧「构建与部署」更新网站', true); loadList(); $('btn-del').style.display=''; }
  else msg('msg-edit', r.error, false);
}
async function deletePost() {
  if (!currentFile || !confirm('确定删除「' + $('f-title').value + '」？此操作不可恢复。')) return;
  const r = await (await fetch('/api/delete', {method:'POST', body: JSON.stringify({file: currentFile})})).json();
  if (r.ok) { loadList(); newPost(); }
}
async function loadAbout() {
  const r = await (await fetch('/api/about')).json();
  $('about-content').value = r.content;
  show('view-about');
}
async function saveAbout() {
  const r = await (await fetch('/api/about', {method:'POST', body: JSON.stringify({content: $('about-content').value})})).json();
  msg('msg-about', r.ok ? '已保存 ✓' : r.error, r.ok);
}
let cfg = {};
async function loadConfig() {
  cfg = await (await fetch('/api/config')).json();
  $('c-name').value = cfg.name || ''; $('c-bio').value = cfg.bio || '';
  $('c-author').value = cfg.author || ''; $('c-url').value = cfg.url || '';
  $('c-permalink').value = cfg.permalink || 'posts/:slug/';
  $('c-analytics').value = cfg.analyticsToken || '';
  const g = cfg.giscus || {};
  $('c-grepo').value = g.repo || ''; $('c-grepoId').value = g.repoId || '';
  $('c-gcat').value = g.category || 'Announcements'; $('c-gcatId').value = g.categoryId || '';
  show('view-config');
}
async function saveConfig() {
  const body = {
    ...cfg,
    name: $('c-name').value, bio: $('c-bio').value,
    author: $('c-author').value, url: $('c-url').value,
    permalink: $('c-permalink').value,
    analyticsToken: $('c-analytics').value.trim(),
    giscus: {
      repo: $('c-grepo').value.trim(), repoId: $('c-grepoId').value.trim(),
      category: $('c-gcat').value.trim() || 'Announcements', categoryId: $('c-gcatId').value.trim(),
    },
  };
  const r = await (await fetch('/api/config', {method:'POST', body: JSON.stringify(body)})).json();
  msg('msg-config', r.ok ? '已保存 ✓ 改了 URL 格局或评论/统计配置的话，重新构建后生效' : r.error, r.ok);
}
async function build() {
  $('build-log').textContent = '构建中...';
  $('build-log').classList.remove('hidden');
  const r = await (await fetch('/api/build', {method:'POST'})).json();
  $('build-log').textContent = r.output + (r.ok ? '\\n构建成功 ✓' : '\\n构建失败');
}
$('nav-new').onclick = newPost;
$('nav-about').onclick = loadAbout;
$('nav-config').onclick = loadConfig;
$('nav-build').onclick = () => show('view-build');
loadList();
</script>
</body></html>`;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  if (url.pathname === '/') return send(res, 200, 'text/html', UI);
  send(res, 404, 'text/plain', 'not found');
}).listen(PORT, () => {
  console.log('博客管理后台已启动: http://localhost:' + PORT);
});
