import { createStorage } from './storage.js';
import { createClickSuppressor } from './touch-gate.js';

export function createReaderApp(options = {}) {
  const config = {
    novelUrl: 'novel.txt',
    storagePrefix: '',
    fallbackStoragePrefix: null,
    ...options
  };

    const reader = document.getElementById('reader');
    const coverScreen = document.getElementById('coverScreen');
    const tocList = document.getElementById('tocList');
    const progressBar = document.getElementById('progressBar');
    const pager = document.getElementById('pager');
    const pageInfo = document.getElementById('pageInfo');
    const toggleModeButton = document.getElementById('toggleMode');
    const toggleTocButton = document.getElementById('toggleToc');
    const toggleFontFamilyButton = document.getElementById('toggleFontFamily');
    const toggleThemeButton = document.getElementById('toggleTheme');
    const layout = document.getElementById('layout');
    const tocNav = document.querySelector('nav.toc');
    const topbar = document.querySelector('.topbar');
    const tocBackdrop = document.getElementById('tocBackdrop');
    const root = document.documentElement;
    const store = createStorage(config.storagePrefix, {
      fallbackPrefix: config.fallbackStoragePrefix
    });
    const getStore = store.get;
    const setStore = store.set;

    let novelText = '';
    let pages = [];
    let displayPages = [];
    let pageCount = 1;
    let novelReady = false;
    let readingMode = getStore('readingMode') || 'scroll';
    let currentPage = Number(getStore('currentPage') || 0);
    let anchorSourceIndex = Number(getStore('readingAnchorSource') || 0);
    let tocHidden = getStore('tocHidden') === 'true';
    let touchStartX = 0;
    let touchStartY = 0;
    let lastSwipeAt = 0;
    let chromeTimer = null;
    let scrollSaveTimer = null;
    let chromeAutoHidePaused = false;
    let tocTouchActive = 0;
    let tocTouchResumeTimer = null;
    let scrollTouch = null;
    let lastChromeToggleAt = 0;
    let suppressScrollClick = false;
    const pageTapClickSuppressor = createClickSuppressor();
    const fontFamilies = ['serif', 'hei', 'kai', 'fang'];
    const fontLabels = { serif: '宋体', hei: '黑体', kai: '楷体', fang: '仿宋' };
    const themes = ['light', 'dark', 'green', 'paper', 'gray'];
    const themeLabels = {
      light: '明亮',
      dark: '暗黑',
      green: '护眼',
      paper: '纸本',
      gray: '灰色'
    };
    function hasClass(element, name) {
      return (` ${element.getAttribute('class') || ''} `).indexOf(` ${name} `) >= 0;
    }

    function addClass(element, name) {
      if (!hasClass(element, name)) element.setAttribute('class', `${element.getAttribute('class') || ''} ${name}`.trim());
    }

    function removeClass(element, name) {
      element.setAttribute('class', (` ${element.getAttribute('class') || ''} `).replace(` ${name} `, ' ').trim());
    }

    function setClass(element, name, enabled) {
      if (enabled) addClass(element, name);
      else removeClass(element, name);
    }

    function persistReadingAnchor(sourceIndex) {
      if (!pages.length) return;
      anchorSourceIndex = Math.max(0, Math.min(sourceIndex, pages.length - 1));
      setStore('readingAnchorSource', String(anchorSourceIndex));
    }

    function findSourceIndexByElementId(id) {
      if (!id) return anchorSourceIndex;
      for (let i = 0; i < pages.length; i += 1) {
        for (const node of pages[i].nodes) {
          if (node.id === id) return i;
        }
      }
      return anchorSourceIndex;
    }

    function captureScrollReadingPosition() {
      const markerY = window.scrollY + Math.min(window.innerHeight * 0.18, 120);
      let bestEl = null;
      let bestTop = -Infinity;
      reader.querySelectorAll('h2[id], h3[id], .book-title').forEach((el) => {
        const top = el.getBoundingClientRect().top + window.scrollY;
        if (top <= markerY + 4 && top >= bestTop) {
          bestTop = top;
          bestEl = el;
        }
      });
      if (!bestEl) {
        reader.querySelectorAll('p').forEach((el) => {
          const top = el.getBoundingClientRect().top + window.scrollY;
          if (top <= markerY && top >= bestTop) {
            bestTop = top;
            bestEl = el;
          }
        });
      }
      if (bestEl && bestEl.id) return findSourceIndexByElementId(bestEl.id);

      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll > 0 && pages.length > 1) {
        const ratio = window.scrollY / maxScroll;
        return Math.min(pages.length - 1, Math.floor(ratio * pages.length));
      }
      return anchorSourceIndex;
    }

    function captureScrollMarkerSnippet() {
      const markerY = window.scrollY + Math.min(window.innerHeight * 0.12, 96);
      let bestEl = null;
      let bestTop = -Infinity;
      reader.querySelectorAll('p, h2, h3, .book-title').forEach((el) => {
        const top = el.getBoundingClientRect().top + window.scrollY;
        if (top <= markerY + 2 && top >= bestTop) {
          bestTop = top;
          bestEl = el;
        }
      });
      return bestEl ? bestEl.textContent.trim().slice(0, 120) : '';
    }

    function persistMarkerSnippet(snippet) {
      if (snippet) setStore('readingMarkerSnippet', snippet);
    }

    function textsMatch(a, b) {
      if (!a || !b) return false;
      const left = a.slice(0, 48);
      const right = b.slice(0, 48);
      return left === right || a.includes(right) || b.includes(left);
    }

    function findDisplayPageBySnippet(snippet) {
      const el = findScrollElementBySnippet(snippet);
      return el ? findDisplayPageByElement(el) : findDisplayPageBySource(anchorSourceIndex);
    }

    function findScrollElementBySnippet(snippet) {
      if (!snippet) return null;
      let target = null;
      reader.querySelectorAll('p, h2, h3, .book-title').forEach((el) => {
        if (!target && textsMatch(el.textContent.trim(), snippet)) target = el;
      });
      return target;
    }

    function findPagedMarkerElement() {
      if (!reader.children.length) return null;
      // 当前页的第一个 h2/h3 就是阅读位置的锚点
      const h = reader.querySelector('h2, h3');
      return h || reader.querySelector('p');
    }

    function findDisplayPageByElement(el) {
      if (!el || !_displayPageGroups.length) return 0;
      // 在预计算的页面分组中查找该元素
      const text = (el.textContent || '').trim().slice(0, 40);
      const id = el.id;
      for (let i = 0; i < _displayPageGroups.length; i++) {
        for (const node of _displayPageGroups[i]) {
          if ((id && node.id === id) || (!id && node.textContent.trim().slice(0, 40) === text)) {
            return i;
          }
        }
      }
      return 0;
    }

    function captureReadingPosition() {
      if (readingMode === 'scroll' && !hasClass(document.body, 'cover-active')) {
        const y = window.scrollY || document.documentElement.scrollTop;
        setStore('scrollPosition', String(y));
        persistReadingAnchor(captureScrollReadingPosition());
        persistMarkerSnippet(captureScrollMarkerSnippet());
        return;
      }
      if (readingMode === 'page') {
        setStore('currentPage', String(currentPage));
        const marker = findPagedMarkerElement();
        const sourceIndex = marker ? findSourceIndexByElementId(marker.id) : anchorSourceIndex;
        persistReadingAnchor(sourceIndex);
        if (marker) persistMarkerSnippet((marker.textContent || '').trim().slice(0, 120));
      }
    }

    function findScrollTargetElement(sourceIndex) {
      const page = pages[sourceIndex];
      if (!page) return null;
      for (const node of page.nodes) {
        if (!node.id) continue;
        const el = document.getElementById(node.id);
        if (el && reader.contains(el)) return el;
      }
      return null;
    }

    function scrollChromeOffset() {
      return hasClass(document.body, 'chrome-hidden')
        ? 12
        : (window.matchMedia('(max-width: 860px)').matches ? 76 : 88);
    }

    function restoreScrollBySnippet(snippet, sourceIndex) {
      const saved = Number(getStore('scrollPosition') || 0);
      const attempt = (triesLeft) => {
        const bySnippet = findScrollElementBySnippet(snippet);
        const el = bySnippet || (sourceIndex !== undefined ? findScrollTargetElement(sourceIndex) : null);
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - scrollChromeOffset();
          window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
          setStore('scrollPosition', String(window.scrollY));
          updateProgress();
          return;
        }
        if (triesLeft > 0) {
          requestAnimationFrame(() => attempt(triesLeft - 1));
          return;
        }
        window.scrollTo({ top: saved, behavior: 'auto' });
        updateProgress();
      };
      requestAnimationFrame(() => attempt(3));
    }

    function restoreScrollToAnchor(sourceIndex) {
      restoreScrollBySnippet(getStore('readingMarkerSnippet') || '', sourceIndex);
    }

    function restoreReadingPositionAfterSettingsChange() {
      if (!novelReady || hasClass(document.body, 'cover-active')) return;
      const snippet = getStore('readingMarkerSnippet') || '';
      if (readingMode === 'page') {
        buildDisplayPages();
        showPage(findDisplayPageBySnippet(snippet));
        return;
      }
      restoreScrollBySnippet(snippet, anchorSourceIndex);
    }

    function normalizeTheme(theme) {
      return themes.indexOf(theme) >= 0 ? theme : 'light';
    }

    function applyTheme(theme) {
      const normalized = normalizeTheme(theme);
      document.body.dataset.theme = normalized;
      setStore('theme', normalized);
      if (toggleThemeButton) {
        toggleThemeButton.textContent = themeLabels[normalized];
        toggleThemeButton.title = `配色：${themeLabels[normalized]}（点击切换）`;
      }
    }

    function closeTocPanel() {
      if (!hasClass(document.body, 'toc-panel-open')) return false;
      applyTocState(true);
      return true;
    }

    function saveScrollPosition() {
      if (readingMode !== 'scroll' || hasClass(document.body, 'cover-active')) return;
      const y = window.scrollY || document.documentElement.scrollTop;
      setStore('scrollPosition', String(y));
    }

    function enterReader({ fromStart = false } = {}) {
      removeClass(document.body, 'cover-active');
      if (!novelReady) return;
      applyTocState(true);

      if (fromStart) {
        persistReadingAnchor(0);
        currentPage = 0;
        setStore('currentPage', '0');
        setStore('scrollPosition', '0');
        setStore('readingMarkerSnippet', '');
      } else {
        anchorSourceIndex = Number(getStore('readingAnchorSource') || 0);
        currentPage = Number(getStore('currentPage') || 0);
      }

      applyMode(readingMode, { skipCapture: true });
      setChromeVisible(false);
    }

    function slugify(text, index) {
      return `chapter-${index}-${text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    }

    function plainHeading(line) {
      return line.replace(/^#{1,6}\s*/, '').trim();
    }

    function addTocLink(toc, element, text, className) {
      const link = document.createElement('a');
      link.href = `#${element.id}`;
      link.textContent = text;
      if (className) link.className = className;
      link.dataset.sourceIndex = String(pages.length - 1);
      link.addEventListener('click', (event) => {
        if (readingMode === 'page') {
          event.preventDefault();
          showPage(findDisplayPageBySource(Number(link.dataset.sourceIndex || 0)));
        }
        applyTocState(true);
        if (readingMode === 'page') setChromeVisible(false);
      });
      toc.appendChild(link);
    }

    function renderInlineMarkdown(text) {
      const fragment = document.createDocumentFragment();
      const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
      parts.forEach((part) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const strong = document.createElement('strong');
          strong.textContent = part.slice(2, -2);
          fragment.appendChild(strong);
        } else if (part.startsWith('`') && part.endsWith('`')) {
          const code = document.createElement('code');
          code.textContent = part.slice(1, -1);
          fragment.appendChild(code);
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      });
      return fragment;
    }

    function pushNode(node) {
      if (!pages.length) {
        pages.push({ title: '封面', id: 'cover', nodes: [] });
      }
      pages[pages.length - 1].nodes.push(node);
    }

    function startPage(title, id) {
      pages.push({ title, id, nodes: [] });
    }

    function renderText(text) {
      const lines = text.replace(/\r\n/g, '\n').split('\n');
      const toc = document.createDocumentFragment();
      let chapterIndex = 0;
      let firstSectionHeading = true;
      pages = [];

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }

        const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
        if (heading) {
          const level = heading[1].length;
          const titleText = plainHeading(trimmed);

          if (level === 1) {
            const title = document.createElement('div');
            title.className = 'book-title';
            title.textContent = titleText;
            pushNode(title);
            return;
          }

          if (level === 2 && titleText.startsWith('作者：')) {
            const byline = document.createElement('div');
            byline.className = 'byline';
            byline.textContent = titleText;
            pushNode(byline);
            return;
          }

          const tag = level <= 2 ? 'h2' : 'h3';
          const el = document.createElement(tag);
          el.textContent = titleText;
          el.id = slugify(titleText, chapterIndex++);
          if (firstSectionHeading) { el.classList.add('first-section'); firstSectionHeading = false; }
          startPage(titleText, el.id);
          pushNode(el);

          const isChapter = /^第.+章/.test(titleText);
          const isMajor = titleText === '序' || titleText === '正文' || titleText === '观前提示' || /^[一二三四五六七八九十百]+$/.test(titleText) || titleText.startsWith('序章') || /^第.+部/.test(titleText) || titleText.startsWith('上：') || titleText.startsWith('下：') || titleText.startsWith('后日谈') || titleText === '创作谈' || titleText === '创作声明';
          if (isChapter || isMajor) {
            addTocLink(toc, el, titleText, isChapter ? 'chapter-link' : 'section-link');
          }
          return;
        }

        if (trimmed === '序' || trimmed.startsWith('上：') || trimmed.startsWith('下：')) {
          const h2 = document.createElement('h2');
          h2.textContent = trimmed;
          h2.id = slugify(trimmed, chapterIndex++);
          if (firstSectionHeading) { h2.classList.add('first-section'); firstSectionHeading = false; }
          startPage(trimmed, h2.id);
          pushNode(h2);
          addTocLink(toc, h2, trimmed, 'section-link');
          return;
        }

        if (/^第.+章\s/.test(trimmed)) {
          const h3 = document.createElement('h3');
          h3.textContent = trimmed;
          h3.id = slugify(trimmed, chapterIndex++);
          if (firstSectionHeading) { h3.classList.add('first-section'); firstSectionHeading = false; }
          startPage(trimmed, h3.id);
          pushNode(h3);
          addTocLink(toc, h3, trimmed, 'chapter-link');
          return;
        }

        if (trimmed.startsWith('《') && trimmed.endsWith('》')) {
          const title = document.createElement('div');
          title.className = 'book-title';
          title.textContent = trimmed;
          pushNode(title);
          return;
        }

        if (trimmed.startsWith('作者：')) {
          const byline = document.createElement('div');
          byline.className = 'byline';
          byline.textContent = trimmed;
          pushNode(byline);
          return;
        }

        const p = document.createElement('p');
        p.appendChild(renderInlineMarkdown(trimmed));
        pushNode(p);
      });

      if (!pages.length) pages.push({ title: '正文', id: 'page-0', nodes: [] });
      tocList.replaceChildren(toc);
      novelReady = true;
      if (hasClass(document.body, 'cover-active')) {
        reader.replaceChildren();
        pager.hidden = true;
        document.body.dataset.mode = readingMode;
        toggleModeButton.textContent = readingMode === 'page' ? '连续' : '翻页';
      } else {
        applyMode(readingMode);
      }
    }

    async function loadNovel() {
      try {
        const response = await fetch(new URL(config.novelUrl, document.baseURI), { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        novelText = await response.text();
        renderText(novelText);
      } catch (error) {
        reader.innerHTML = '<p class="loading">正文载入失败。请确认 novel.txt 已上传到同一目录。</p>';
        tocList.textContent = '目录载入失败';
      }
    }

    function cloneNodes(nodes) {
      return nodes.map((node) => node.cloneNode(true));
    }

    function findDisplayPageBySource(sourceIndex) {
      if (sourceIndex < 0 || sourceIndex >= pages.length) return 0;
      const page = pages[sourceIndex];
      if (!page || !page.nodes) return 0;
      // 找到 source page 的第一个节点，在预计算分组中查找
      const firstNode = page.nodes[0];
      const id = firstNode.id || '';
      const text = (firstNode.textContent || '').trim().slice(0, 40);
      for (let i = 0; i < _displayPageGroups.length; i++) {
        for (const node of _displayPageGroups[i]) {
          if ((id && node.id === id) || (!id && text && node.textContent.trim().slice(0, 40) === text)) {
            return i;
          }
        }
      }
      return 0;
    }

    function allContentNodes() {
      const nodes = [];
      pages.forEach((page, sourceIndex) => {
        cloneNodes(page.nodes).forEach((node) => nodes.push({ node, sourceIndex }));
      });
      return nodes;
    }

    function renderContinuous() {
      const fragment = document.createDocumentFragment();
      pages.forEach((page) => {
        cloneNodes(page.nodes).forEach((node) => fragment.appendChild(node));
      });
      removeClass(reader, 'paged-reader');
      reader.style.removeProperty('--page-width');
      reader.style.removeProperty('--page-gap');
      reader.scrollLeft = 0;
      reader.replaceChildren(fragment);
      pager.hidden = true;
      toggleModeButton.textContent = '翻页';
      document.body.dataset.mode = 'scroll';
      setChromeVisible(false);
      updateProgress();
    }

    function renderPagedContent() {
      const fragment = document.createDocumentFragment();
      pages.forEach((page) => {
        cloneNodes(page.nodes).forEach((node) => fragment.appendChild(node));
      });
      reader.replaceChildren(fragment);
    }

    // JS 手动分页：测量元素高度，切割为固定高度页面，彻底告别 CSS columns 对齐问题
    let _displayPageWrappers = [];

    // 预计算的页面分组（每组是源元素数组），只在 rebuild 时刷新
    let _displayPageGroups = [];

    // 在 overflow 元素内找到最后一个能完整显示的字，返回 { splitAfter }（字符索引）
    function findLineSplit(el, maxRelBottom, origin) {
      const totalChars = el.textContent.length;
      if (!totalChars) return 0;
      // 收集所有文本节点
      const textNodes = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let tn;
      while ((tn = walker.nextNode())) textNodes.push(tn);
      // 二分查找最后一个不溢出的字符
      let lo = 0, hi = totalChars;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const range = document.createRange();
        // 定位到第 mid 个字符
        let rem = mid;
        let endNode = textNodes[0], endOff = 0;
        for (const n of textNodes) {
          if (rem <= n.length) { endNode = n; endOff = rem; break; }
          rem -= n.length;
        }
        range.setStart(textNodes[0], 0);
        range.setEnd(endNode, endOff);
        const rect = range.getBoundingClientRect();
        if (rect.bottom - origin <= maxRelBottom) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      if (lo === 0) return 0; // 第一个字就溢出，无法拆分
      // 找到 lo 所在行的行首：往前找到第一个 top 不同的字
      let lineStart = lo;
      const loRange = document.createRange();
      let rem = lo;
      let loNode = textNodes[0], loOff = 0;
      for (const n of textNodes) {
        if (rem <= n.length) { loNode = n; loOff = rem; break; }
        rem -= n.length;
      }
      loRange.setStart(loNode, Math.max(0, loOff - 1));
      loRange.setEnd(loNode, loOff);
      const loTop = loRange.getBoundingClientRect().top;
      while (lineStart > 0) {
        rem = lineStart - 1;
        let prevNode = textNodes[0], prevOff = 0;
        for (const n of textNodes) {
          if (rem <= n.length) { prevNode = n; prevOff = rem; break; }
          rem -= n.length;
        }
        const prevRange = document.createRange();
        prevRange.setStart(prevNode, Math.max(0, prevOff - 1));
        prevRange.setEnd(prevNode, prevOff);
        if (Math.abs(prevRange.getBoundingClientRect().top - loTop) > 1) break;
        lineStart--;
      }
      return lineStart;
    }

    // 把 el 在字符索引 splitAfter 处切开：返回 [前半, 后半]
    function splitElement(el, splitAfter) {
      if (splitAfter <= 0) return [null, el.cloneNode(true)];
      const totalChars = el.textContent.length;
      if (splitAfter >= totalChars) return [el.cloneNode(true), null];
      const textNodes = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let tn;
      while ((tn = walker.nextNode())) textNodes.push(tn);
      // 找到 splitAfter 所在的文本节点
      let rem = splitAfter;
      let splitNode = null, splitOff = 0;
      for (const n of textNodes) {
        if (rem <= n.length) { splitNode = n; splitOff = rem; break; }
        rem -= n.length;
      }
      if (!splitNode) return [el.cloneNode(true), null];
      // 克隆并切割
      const before = el.cloneNode(true);
      const after = el.cloneNode(true);
      // 前半：保留 splitAfter 之前的文本
      const beforeWalk = document.createTreeWalker(before, NodeFilter.SHOW_TEXT);
      const beforeNodes = [];
      let bn;
      while ((bn = beforeWalk.nextNode())) beforeNodes.push(bn);
      rem = splitAfter;
      for (const n of beforeNodes) {
        if (rem <= 0) { n.textContent = ''; }
        else if (rem < n.length) { n.textContent = n.textContent.slice(0, rem); rem = 0; }
        else { rem -= n.length; }
      }
      // 后半：保留 splitAfter 之后的文本
      const afterWalk = document.createTreeWalker(after, NodeFilter.SHOW_TEXT);
      const afterNodes = [];
      let an;
      while ((an = afterWalk.nextNode())) afterNodes.push(an);
      rem = splitAfter;
      for (const n of afterNodes) {
        if (rem >= n.length) { n.textContent = ''; rem -= n.length; }
        else { n.textContent = n.textContent.slice(rem); rem = 0; }
      }
      return [before, after];
    }

    function buildDisplayPages() {
      addClass(reader, 'paged-reader');
      renderPagedContent();
      void reader.offsetHeight;
      const cs = getComputedStyle(reader);
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padBottom = parseFloat(cs.paddingBottom) || 0;
      const borderTop = parseFloat(cs.borderTopWidth) || 0;
      const borderBottom = parseFloat(cs.borderBottomWidth) || 0;
      const viewHeight = parseFloat(cs.height) - padTop - padBottom - borderTop - borderBottom;
      const contentTop = reader.getBoundingClientRect().top + borderTop + padTop;
      const children = Array.from(reader.children);

      // 预收集每个元素的位置（viewport 绝对坐标）
      const items = children.map(el => {
        const r = el.getBoundingClientRect();
        return { el, top: r.top, bottom: r.bottom };
      });

      const groups = [];
      let group = [];
      let pageOrigin = contentTop; // 当前页在 viewport 中的绝对 top

      for (const item of items) {
        const relBottom = item.bottom - pageOrigin;

        if (group.length > 0 && relBottom > viewHeight) {
          // 溢出——尝试按行切分（用 pageOrigin 作为绝对坐标原点）
          const splitChar = findLineSplit(item.el, viewHeight, pageOrigin);
          if (splitChar > 0 && splitChar < item.el.textContent.length) {
            const [firstHalf, secondHalf] = splitElement(item.el, splitChar);
            if (firstHalf && firstHalf.textContent.trim()) group.push(firstHalf);
            groups.push(group);
            group = [];
            pageOrigin = pageOrigin + viewHeight; // 下一页
            if (secondHalf && secondHalf.textContent.trim()) {
              group.push(secondHalf);
            }
            continue;
          }
          // 无法切分，整段移到下一页
          groups.push(group);
          group = [item.el];
          pageOrigin = item.top;
        } else {
          if (group.length === 0) pageOrigin = item.top;
          group.push(item.el);
        }
      }
      if (group.length > 0) groups.push(group);

      _displayPageGroups = groups;
      pageCount = groups.length;
      displayPages = [];
      renderPageDOM(currentPage);
    }

    // 把第 pageIndex 页的元素渲染到 reader 中
    function renderPageDOM(pageIndex) {
      const els = _displayPageGroups[pageIndex] || [];
      const fragment = document.createDocumentFragment();
      els.forEach(el => fragment.appendChild(el.cloneNode(true)));
      reader.replaceChildren(fragment);
    }

    function renderPagedDocument(pageIndex) {
      buildDisplayPages();
      let target = pageIndex;
      if (target === undefined) target = currentPage;
      target = Math.max(0, Math.min(target, pageCount - 1));
      showPage(target);
    }

    function updatePagedMetrics() {
      currentPage = Math.max(0, Math.min(currentPage, pageCount - 1));
      pageInfo.textContent = `${currentPage + 1} / ${pageCount}`;
      document.getElementById('prevPage').disabled = currentPage === 0;
      document.getElementById('nextPage').disabled = currentPage === pageCount - 1;
      updateProgress();
    }

    function showPage(index) {
      if (readingMode !== 'page') return;
      if (!_displayPageGroups.length) {
        renderPagedDocument(index);
        return;
      }
      currentPage = Math.max(0, Math.min(index, pageCount - 1));
      setStore('currentPage', String(currentPage));
      // 直接替换 DOM，只显示当前页内容——彻底解决滚动对齐、跨页显示的根源
      renderPageDOM(currentPage);
      const marker = findPagedMarkerElement();
      if (marker) {
        persistReadingAnchor(findSourceIndexByElementId(marker.id));
        persistMarkerSnippet((marker.textContent || '').trim().slice(0, 120));
      }
      updatePagedMetrics();
    }

    function applyMode(mode, options = {}) {
      const previousMode = readingMode;
      if (novelReady && !options.skipCapture && previousMode !== mode) {
        captureReadingPosition();
      }

      readingMode = mode;
      setStore('readingMode', readingMode);
      scrollTouch = null;
      if (readingMode === 'page') {
        pager.hidden = false;
        toggleModeButton.textContent = '连续';
        document.body.dataset.mode = 'page';
        buildDisplayPages();
        const snippet = getStore('readingMarkerSnippet') || '';
        showPage(findDisplayPageBySnippet(snippet));
        setChromeVisible(false);
      } else {
        renderContinuous();
        restoreScrollToAnchor(anchorSourceIndex);
        setChromeVisible(false);
      }
      applyTocState(tocHidden);
    }

    function isChromeVisible() {
      return !hasClass(document.body, 'chrome-hidden');
    }

    function scheduleChromeAutoHide() {
      clearTimeout(chromeTimer);
      if (!isChromeVisible() || chromeAutoHidePaused) return;
      chromeTimer = setTimeout(() => {
        if (!chromeAutoHidePaused) setChromeVisible(false);
      }, 1600);
    }

    function pauseChromeAutoHide() {
      chromeAutoHidePaused = true;
      clearTimeout(chromeTimer);
    }

    function resumeChromeAutoHide() {
      chromeAutoHidePaused = false;
      scheduleChromeAutoHide();
    }

    function setChromeVisible(visible, autoHide = false) {
      clearTimeout(chromeTimer);
      setClass(document.body, 'chrome-hidden', !visible);
      if (visible && autoHide) scheduleChromeAutoHide();
    }

    function toggleReadingChrome(autoHide = true) {
      const now = Date.now();
      if (now - lastChromeToggleAt < 320) return;
      lastChromeToggleAt = now;
      setChromeVisible(!isChromeVisible(), autoHide);
    }

    function isTapGesture(start, end, maxDuration = 800, maxMove = 40) {
      if (!start) return false;
      const dx = end.clientX - start.x;
      const dy = end.clientY - start.y;
      const duration = Date.now() - start.t;
      return duration <= maxDuration && Math.hypot(dx, dy) <= maxMove;
    }

    function isInReaderCenter(clientX, clientY) {
      const rect = reader.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return false;
      }
      const relX = (clientX - rect.left) / Math.max(1, rect.width);
      return relX >= 0.34 && relX <= 0.66;
    }

    function isReaderTapTarget(element) {
      return Boolean(element && element.closest('#reader') && !element.closest('a, button'));
    }

    function bindChromePauseTarget(element) {
      if (!element) return;
      element.addEventListener('mouseenter', pauseChromeAutoHide);
      element.addEventListener('mouseleave', () => {
        if (tocTouchActive > 0) return;
        resumeChromeAutoHide();
      });
      element.addEventListener('touchstart', () => {
        tocTouchActive += 1;
        pauseChromeAutoHide();
      }, { passive: true });
      const onTouchEnd = () => {
        tocTouchActive = Math.max(0, tocTouchActive - 1);
        clearTimeout(tocTouchResumeTimer);
        tocTouchResumeTimer = setTimeout(() => {
          if (tocTouchActive === 0) resumeChromeAutoHide();
        }, 450);
      };
      element.addEventListener('touchend', onTouchEnd, { passive: true });
      element.addEventListener('touchcancel', onTouchEnd, { passive: true });
      element.addEventListener('scroll', pauseChromeAutoHide, { passive: true });
      element.addEventListener('pointerdown', pauseChromeAutoHide);
    }

    bindChromePauseTarget(tocNav);
    bindChromePauseTarget(topbar);

    function applyTocState(hidden) {
      tocHidden = hidden;
      setStore('tocHidden', String(tocHidden));
      setClass(layout, 'toc-hidden', true);
      setClass(document.body, 'toc-panel-open', !tocHidden);
      if (tocBackdrop) {
        tocBackdrop.hidden = hidden;
        tocBackdrop.setAttribute('aria-hidden', String(hidden));
      }
      toggleTocButton.textContent = tocHidden ? '显示目录' : '隐藏目录';
      toggleTocButton.setAttribute('aria-pressed', String(!tocHidden));
      updateProgress();
    }

    function updateProgress() {
      let ratio = 0;
      if (readingMode === 'page' && pageCount > 1) {
        ratio = currentPage / (pageCount - 1);
      } else {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - window.innerHeight;
        ratio = height > 0 ? Math.min(1, Math.max(0, scrollTop / height)) : 0;
      }
      progressBar.style.width = `${ratio * 100}%`;
    }

    document.getElementById('increaseFont').addEventListener('click', () => {
      if (novelReady && !hasClass(document.body, 'cover-active')) captureReadingPosition();
      const current = Number(getStore('fontScale') || 1);
      const next = Math.min(1.35, current + 0.05);
      setStore('fontScale', next);
      root.style.setProperty('--font-scale', next);
      restoreReadingPositionAfterSettingsChange();
    });

    document.getElementById('decreaseFont').addEventListener('click', () => {
      if (novelReady && !hasClass(document.body, 'cover-active')) captureReadingPosition();
      const current = Number(getStore('fontScale') || 1);
      const next = Math.max(0.85, current - 0.05);
      setStore('fontScale', next);
      root.style.setProperty('--font-scale', next);
      restoreReadingPositionAfterSettingsChange();
    });

    toggleFontFamilyButton.addEventListener('click', () => {
      if (novelReady && !hasClass(document.body, 'cover-active')) captureReadingPosition();
      const current = getStore('fontFamily') || 'serif';
      const next = fontFamilies[(fontFamilies.indexOf(current) + 1) % fontFamilies.length];
      setStore('fontFamily', next);
      document.body.dataset.font = next;
      toggleFontFamilyButton.textContent = fontLabels[next];
      restoreReadingPositionAfterSettingsChange();
    });

    toggleThemeButton.addEventListener('click', () => {
      const current = normalizeTheme(document.body.dataset.theme || 'light');
      const next = themes[(themes.indexOf(current) + 1) % themes.length];
      applyTheme(next);
    });

    document.getElementById('startReading').addEventListener('click', (event) => {
      event.preventDefault();
      enterReader({ fromStart: true });
    });

    document.getElementById('continueReading').addEventListener('click', (event) => {
      event.preventDefault();
      enterReader({ fromStart: false });
    });

    toggleModeButton.addEventListener('click', () => {
      applyMode(readingMode === 'page' ? 'scroll' : 'page');
    });

    toggleTocButton.addEventListener('click', () => {
      const willShow = tocHidden;
      applyTocState(!tocHidden);
      if (willShow) {
        setChromeVisible(true);
        pauseChromeAutoHide();
        requestAnimationFrame(() => tocList.scrollIntoView({ block: 'nearest' }));
      }
    });

    if (tocBackdrop) {
      tocBackdrop.addEventListener('click', closeTocPanel);
      tocBackdrop.addEventListener('touchend', (event) => {
        event.preventDefault();
        closeTocPanel();
      });
    }

    document.getElementById('prevPage').addEventListener('click', () => showPage(currentPage - 1));
    document.getElementById('nextPage').addEventListener('click', () => showPage(currentPage + 1));

    function handleScrollModeTap(clientX, clientY) {
      if (closeTocPanel()) return;
      if (!isInReaderCenter(clientX, clientY)) return;
      toggleReadingChrome(true);
    }

    function handlePageModeTap(clientX, clientY) {
      if (closeTocPanel()) return;
      const rect = reader.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const x = clientX - rect.left;
      if (x < width * 0.34) {
        showPage(currentPage - 1);
        return;
      }
      if (x > width * 0.66) {
        showPage(currentPage + 1);
        return;
      }
      toggleReadingChrome(true);
    }

    document.addEventListener('touchstart', (event) => {
      if (readingMode !== 'scroll' || hasClass(document.body, 'cover-active') || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const hit = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!isReaderTapTarget(hit)) return;
      scrollTouch = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        t: Date.now()
      };
    }, { capture: true, passive: true });

    document.addEventListener('touchend', (event) => {
      if (readingMode !== 'scroll' || !scrollTouch) return;
      let touch = null;
      for (let i = 0; i < event.changedTouches.length; i += 1) {
        if (event.changedTouches[i].identifier === scrollTouch.id) {
          touch = event.changedTouches[i];
          break;
        }
      }
      if (!touch) return;
      const snapshot = scrollTouch;
      scrollTouch = null;
      if (!isTapGesture(snapshot, touch)) return;
      suppressScrollClick = true;
      handleScrollModeTap(touch.clientX, touch.clientY);
    }, { capture: true, passive: true });

    document.addEventListener('touchcancel', () => {
      scrollTouch = null;
    }, { capture: true, passive: true });

    reader.addEventListener('touchstart', (event) => {
      if (readingMode !== 'page' || event.touches.length !== 1) return;
      const touch = event.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }, { passive: true });

    reader.addEventListener('touchend', (event) => {
      if (readingMode !== 'page') return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        lastSwipeAt = Date.now();
        showPage(currentPage + (dx < 0 ? 1 : -1));
        return;
      }
      if (Date.now() - lastSwipeAt < 350) return;
      if (Math.abs(dx) <= 16 && Math.abs(dy) <= 16) {
        pageTapClickSuppressor.suppressFor(450);
        handlePageModeTap(touch.clientX, touch.clientY);
      }
    }, { passive: true });

    reader.addEventListener('click', (event) => {
      const now = Date.now();
      if (now - lastSwipeAt < 350) return;
      if (readingMode !== 'page') {
        if (suppressScrollClick) {
          suppressScrollClick = false;
          return;
        }
        if (event.target.closest('.toc, .topbar, .pager, .tools')) return;
        handleScrollModeTap(event.clientX, event.clientY);
        return;
      }
      if (pageTapClickSuppressor.isSuppressed(now)) return;
      handlePageModeTap(event.clientX, event.clientY);
    });

    window.addEventListener('resize', () => {
      if (readingMode === 'page' && novelReady) {
        captureReadingPosition();
        restoreReadingPositionAfterSettingsChange();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (readingMode !== 'page') return;
      if (event.key === 'ArrowLeft') showPage(currentPage - 1);
      if (event.key === 'ArrowRight') showPage(currentPage + 1);
    });

    reader.addEventListener('copy', (event) => event.preventDefault());
    reader.addEventListener('cut', (event) => event.preventDefault());
    reader.addEventListener('contextmenu', (event) => event.preventDefault());

    root.style.setProperty('--font-scale', getStore('fontScale') || 1);
    applyTheme(getStore('theme') || 'light');
    const savedFont = getStore('fontFamily') || 'serif';
    document.body.dataset.font = fontFamilies.indexOf(savedFont) >= 0 ? savedFont : 'serif';
    toggleFontFamilyButton.textContent = fontLabels[document.body.dataset.font] || '宋体';
    applyTocState(tocHidden);
    window.addEventListener('scroll', () => {
      updateProgress();
      clearTimeout(scrollSaveTimer);
      scrollSaveTimer = setTimeout(saveScrollPosition, 200);
    }, { passive: true });
    loadNovel().then(updateProgress);
}

