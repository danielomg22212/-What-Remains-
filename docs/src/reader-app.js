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
        rebuildDisplayPages();
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
          startPage(trimmed, h2.id);
          pushNode(h2);
          addTocLink(toc, h2, trimmed, 'section-link');
          return;
        }

        if (/^第.+章\s/.test(trimmed)) {
          const h3 = document.createElement('h3');
          h3.textContent = trimmed;
          h3.id = slugify(trimmed, chapterIndex++);
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
      if (!displayPages.length) return 0;
      const index = displayPages.findIndex((page) => page.sources.indexOf(sourceIndex) >= 0);
      return index >= 0 ? index : 0;
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

    function pageStep() {
      return reader.clientWidth + Number(getComputedStyle(reader).columnGap.replace('px', '') || 0);
    }

    function syncPagedColumns() {
      const w = reader.clientWidth;
      const gap = Math.max(24, Math.round(w * 0.08));
      // 先设置 CSS 变量，再强制重排后读取 scrollWidth
      reader.style.setProperty('--page-width', `${w}px`);
      reader.style.setProperty('--page-gap', `${gap}px`);
      // 触发强制重排，确保浏览器完成多栏布局后再读取 scrollWidth
      void reader.offsetHeight;
      pageCount = Math.max(1, Math.ceil(reader.scrollWidth / Math.max(1, w + gap)));
    }

    function rebuildDisplayPages() {
      // 先设置栏宽 CSS 变量，再渲染内容，确保内容直接按正确栏宽布局
      const w = reader.clientWidth;
      const gap = Math.max(24, Math.round(w * 0.08));
      reader.style.setProperty('--page-width', `${w}px`);
      reader.style.setProperty('--page-gap', `${gap}px`);
      addClass(reader, 'paged-reader');
      displayPages = [];
      renderPagedContent();
      // 强制重排后读取最终 scrollWidth
      void reader.offsetHeight;
      pageCount = Math.max(1, Math.ceil(reader.scrollWidth / Math.max(1, w + gap)));
    }

    function renderPagedDocument(pageIndex) {
      rebuildDisplayPages();
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
      if (!reader.children.length) {
        renderPagedDocument();
        return;
      }
      currentPage = Math.max(0, Math.min(index, pageCount - 1));
      setStore('currentPage', currentPage);
      reader.scrollTo({ left: currentPage * pageStep(), top: 0, behavior: 'auto' });
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
        rebuildDisplayPages();
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

