# 私有仓库迁移指南

将仓库改为 **Private** 后，陌生人无法再在 GitHub 上浏览、克隆你的源码与 Git 历史；**在线阅读站仍可正常访问**（GitHub Pages 会继续从 `docs/` 发布）。

> **请知悉：** Pages 站点上的 `novel.txt` 仍可通过浏览器地址直接访问。私有仓库保护的是「仓库与提交记录」，不是「已发布的静态网页文件」。更强防护需后续分章下发等方案。

---

## 方案 A：原地改为私有（推荐）

适用于：继续使用 `danielomg22212/-What-Remains-` 这个仓库。

### 第 1 步：在 GitHub 网页改为 Private

1. 登录 GitHub，打开：  
   **https://github.com/danielomg22212/-What-Remains-/settings**
2. 滚动到页面最下方 **Danger Zone（危险区域）**。
3. 点击 **Change repository visibility** → 选择 **Make private**。
4. 按提示输入仓库名并确认。

### 第 2 步：确认 Pages 仍开启

1. 打开：**https://github.com/danielomg22212/-What-Remains-/settings/pages**
2. 确认：
   - **Source**：Deploy from a branch  
   - **Branch**：`main`  
   - **Folder**：`/docs`
3. 若显示 “Your site is live at …”，记下地址（一般不变）：  
   `https://danielomg22212.github.io/-What-Remains-/`

### 第 3 步：验证

| 检查项 | 预期 |
|--------|------|
| 未登录 / 无痕打开仓库主页 | 显示 404 或无权访问 |
| 打开 Pages 阅读地址 | 封面、正文、创作声明正常 |
| 本地 `git push github main` | 仍可推送（需有仓库权限） |

### 第 4 步：本地无需改 remote

```powershell
cd "c:\Users\xiaosiyu\Documents\Codex\2026-05-28\https-chatgpt-com-share-6a17e644-6a68"
git remote -v
# 应仍为 github → https://github.com/danielomg22212/-What-Remains-.git
git push github main
```

首次 push 到私有仓库时，GitHub 可能要求登录或 Personal Access Token（PAT），按提示完成即可。

---

## 方案 B：新建私有仓库再迁移

适用于：希望换仓库名，或想放弃原公开仓库的关联。

1. GitHub 右上角 **+** → **New repository**。
2. 名称自定（例如 `hou-lai-ru-he-reader`），勾选 **Private**，不要勾选 “Add a README”（避免冲突）。
3. 本地执行：

```powershell
cd "c:\Users\xiaosiyu\Documents\Codex\2026-05-28\https-chatgpt-com-share-6a17e644-6a68"
git remote rename github github-old
git remote add github https://github.com/danielomg22212/新仓库名.git
git push -u github main
```

4. 在新仓库 **Settings → Pages** 同样选择 `main` + `/docs`。
5. 新 Pages 地址为：`https://danielomg22212.github.io/新仓库名/`
6. 确认新站无误后，将旧公开仓库 **Archive** 或改为 Private / 删除（删除不可恢复，请谨慎）。

---

## 迁移后日常流程（不变）

```powershell
# 修改 docs/novel.txt 或阅读器后
git add docs/
git commit -m "Update reader"
git push github main
```

---

## 本地手稿勿误提交

仓库根目录已配置 `.gitignore`，忽略 `hou_lai_ru_he_*.md`、`yu_changyuan_*.md` 等本地修订稿。  
**对外仅提交 `docs/novel.txt`** 作为发布正文。

若定稿有更新：

1. 在本地改 `hou_lai_ru_he_full.md`（或你的主稿）。  
2. 导出/复制到 `docs/novel.txt`。  
3. 再 `git add docs/novel.txt` 并推送。

---

## 若仓库曾经是 Public

改为 Private **不能**自动抹掉他人已 clone 的副本或搜索引擎缓存。建议：

- 保留《创作声明》与发表时间记录；  
- 必要时考虑版权登记；  
- 重要泄露渠道可另行处理，不在本指南范围。

---

## 迁移检查清单

- [ ] 仓库已为 **Private**（方案 A 或 B 完成）
- [ ] Pages：`main` + `/docs`，站点可访问
- [ ] 无痕窗口无法打开仓库源码页
- [ ] 阅读器功能正常（封面、翻页、目录、创作声明）
- [ ] `docs/robots.txt` 已禁止索引 `novel.txt`（减损，非绝对防护）
- [ ] 本地根目录修订稿未被 `git add` 进仓库

---

## 需要帮助时

- 部署通用说明：[DEPLOY.md](DEPLOY.md)  
- 作品授权：正文「创作声明」**X_siyu@outlook.com**
