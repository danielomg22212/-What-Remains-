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

## 四、版权与仓库可见性（重要）

### 当前方式的局限

- 阅读器通过 `fetch('novel.txt')` 加载正文，任何人只要知道地址即可直接下载，例如：  
  `https://你的用户名.github.io/仓库名/novel.txt`
- 若仓库为 **Public**，完整正文通常也在 Git 历史里，可被 `git clone` 获取。
- 页面内的「禁止复制」仅对普通浏览器操作有效，**不能**替代法律保护，也无法从技术层面彻底禁止下载。

### 建议做法（按优先级）

| 做法 | 说明 |
|------|------|
| **仓库设为 Private** | 源码与 `novel.txt` 不对公众开放；Pages 仍可对外提供阅读站（GitHub 免费账户支持 private 仓库的 Pages）。 |
| **公开仓库只放阅读站** | 若必须 public：勿把未删节的完整定稿长期放在公开分支；仅同步对外发布的 `docs/novel.txt`。 |
| **保留《创作声明》** | 已写在 `novel.txt` 文末，阅读器目录中可进入该节。 |
| **登记与留痕** | 需要更强举证时，可向中国版权保护中心登记；保留首次发表时间与邮件/Git 提交记录。 |

更严格的防爬、分章下发、隐形水印等需后续单独改造（例如 Workers、分片、私有部署），本说明暂不展开。

---

## 五、可选：`robots.txt`

当前 `docs/robots.txt` 允许全部抓取。若希望减少搜索引擎直接索引正文文件，可改为：

```
User-agent: *
Allow: /
Disallow: /novel.txt
```

注意：这**不能**阻止人工或脚本直接访问 URL，仅对部分爬虫有效。

修改后同样 `git add docs/robots.txt` 并推送。

---

## 六、部署检查清单

- [ ] `docs/novel.txt` 已更新且能在本地打开 `docs/index.html` 预览（需本地静态服务或直接部署后测）
- [ ] 已推送至 `main` 分支
- [ ] GitHub Pages 显示最近部署成功
- [ ] 手机与电脑各测：封面、连续/翻页、目录关闭、字号与配色
- [ ] 文末「创作声明」显示完整
- [ ] 已根据需要做仓库 Public / Private 决策

---

## 七、联系

作品与授权事宜见正文「创作声明」：**X_siyu@outlook.com**
