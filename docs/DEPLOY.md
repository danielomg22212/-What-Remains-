# 《后来如何》在线阅读站 — 部署说明

本文说明如何把 `docs/` 目录发布到 GitHub Pages，以及和版权、正文保护相关的建议。

**在线地址示例：** `https://danielomg22212.github.io/-What-Remains-/`

---

## 一、目录结构

```
docs/
  index.html      # 阅读器页面
  styles.css      # 样式
  novel.txt       # 正文（Markdown 标题格式）
  cover.svg       # 封面图
  robots.txt      # 爬虫提示（可选调整）
  DEPLOY.md       # 本说明
```

GitHub Pages 只发布 `docs/` 下的静态文件，不需要服务器。

---

## 二、日常更新正文

1. 在本地修改 `docs/novel.txt`（或从你的定稿导出后覆盖）。
2. 在仓库根目录执行：

```powershell
cd "你的仓库路径"
git add docs/novel.txt
git commit -m "Update novel text"
git push github main
```

3. 推送后约 1–3 分钟生效。浏览器强刷避免缓存，例如：

   `https://danielomg22212.github.io/-What-Remains-/?v=20260604`

   修改 `index.html` 里 `styles.css` 的版本号参数，也可强制读者加载新样式。

---

## 三、首次启用 GitHub Pages

1. 打开 GitHub 仓库 **Settings → Pages**。
2. **Source** 选 **Deploy from a branch**。
3. **Branch** 选 `main`，文件夹选 **`/docs`**。
4. 保存后等待部署完成，访问提示的 `*.github.io` 地址。

本地 remote 名称若为 `github`：

```powershell
git remote -v
git push github main
```

---

## 四、私有仓库（请完成）

**请按专门指南操作：** [PRIVATE_REPO_MIGRATION.md](PRIVATE_REPO_MIGRATION.md)

摘要：

1. 打开仓库 **Settings → Danger Zone → Make private**（推荐方案 A，保留现有 Pages 地址）。  
2. **Settings → Pages** 保持 `main` + `/docs`。  
3. 本地 `git push github main` 不变；根目录修订稿已由 `.gitignore` 排除，勿误提交。

### 私有仓库能保护什么

| 能保护 | 仍公开 |
|--------|--------|
| GitHub 上浏览 / clone 源码与历史 | Pages 上的阅读页与 `novel.txt` URL |
| 他人直接看到你的提交与分支 | 已被人保存的旧 clone（若曾长期 Public） |

页面「禁止复制」与 `robots.txt` 的 `Disallow: /novel.txt` 仅作减损，不能替代私有仓库或法律保护。更严格的防爬、分章下发、隐形水印等可后续再做。

---

## 五、`robots.txt`

已配置为允许站点、禁止索引正文文件：

```
User-agent: *
Allow: /
Disallow: /novel.txt
```

推送 `docs/robots.txt` 后生效；**不能**阻止人工直接访问 URL。

---

## 六、部署检查清单

- [ ] `docs/novel.txt` 已更新且能在本地打开 `docs/index.html` 预览（需本地静态服务或直接部署后测）
- [ ] 已推送至 `main` 分支
- [ ] GitHub Pages 显示最近部署成功
- [ ] 手机与电脑各测：封面、连续/翻页、目录关闭、字号与配色
- [ ] 文末「创作声明」显示完整
- [ ] 已完成 [PRIVATE_REPO_MIGRATION.md](PRIVATE_REPO_MIGRATION.md) 中的私有仓库迁移

---

## 七、联系

作品与授权事宜见正文「创作声明」：**X_siyu@outlook.com**
