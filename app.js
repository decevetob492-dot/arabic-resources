/**
 * مكتبة الموارد المجانية - تطبيق البحث الرئيسي
 * دليل شامل للكتب، الألعاب، البرامج، الفيديوهات، التعليم وغيرها
 */

// ============================================
// قاعدة البيانات (مُحمّلة من resources.js)
// ============================================
const RESOURCES_DB = window.ResourcesDB || { CATEGORIES: [], RESOURCES: [] };
const CATEGORIES = RESOURCES_DB.CATEGORIES || [];
const RESOURCES = RESOURCES_DB.RESOURCES || [];

// ============================================
// حالة التطبيق
// ============================================
const state = {
    searchQuery: '',
    activeTab: 'all',
    selectedCategory: null,
    filters: {
        type: [],
        platform: [],
        language: [],
        access: []
    },
    currentPage: 1,
    resultsPerPage: 12,
    liveResultsPerPage: 8,
    totalPages: 1,
    searching: false,
    voiceSearchActive: false,
};

// ============================================
// عناصر DOM
// ============================================
const elements = {
    searchFormHeader: document.getElementById('searchFormHeader'),
    searchInputHeader: document.getElementById('searchInputHeader'),
    categoriesGrid: document.getElementById('categoriesGrid'),
    filtersSection: document.getElementById('filtersSection'),
    searchResultsTitle: document.getElementById('searchResultsTitle'),
    resultsCount: document.getElementById('resultsCount'),
    resultsTime: document.getElementById('resultsTime'),
    filterChips: document.getElementById('filterChips'),
    loading: document.getElementById('loading'),
    resultsSection: document.getElementById('resultsSection'),
    resultsGrid: document.getElementById('resultsGrid'),
    noResults: document.getElementById('noResults'),
    pagination: document.getElementById('pagination'),
    pageNumbers: document.getElementById('pageNumbers'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    liveResultsSection: document.getElementById('liveResultsSection'),
    liveResultsGrid: document.getElementById('liveResultsGrid'),
    liveResultsStatus: document.getElementById('liveResultsStatus'),
    footerCategories: document.getElementById('footerCategories'),
    footerTags: document.getElementById('footerTags'),
};

// ============================================
// البحث الحي عبر الإنترنت (Exa)
// ============================================
const EXA_ENDPOINT = '/api/search';
let liveSearchController = null;

// ============================================
// التهيئة
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initScrollAnimations();
    renderCategories();
    renderFooter();
    setupEventListeners();
    initTestimonials();
});

function setupEventListeners() {
    elements.searchFormHeader.addEventListener('submit', handleSearch);
    elements.searchInputHeader.addEventListener('input', debounce(handleInput, 300));
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        const context = this;
        const args2 = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args2), wait);
    };
}

// ============================================
// رسم التصنيفات
// ============================================
function renderCategories() {
    const grid = elements.categoriesGrid;
    grid.innerHTML = '';

    CATEGORIES.forEach((cat, index) => {
        const card = document.createElement('div');
        card.className = 'category-card magnetic-btn';
        card.dataset.category = cat.id;
        card.style.setProperty('--cat-color', cat.color);
        card.innerHTML = `
            <div class="category-icon" style="background: ${cat.color}20; border: 2px solid ${cat.color}">
                <span style="font-size: 2rem">${cat.icon}</span>
            </div>
            <div class="category-content">
                <h3>${cat.name}</h3>
                <p>${cat.description}</p>
                <div class="category-meta">
                    <span class="category-count">${cat.count} مورد</span>
                    <button class="category-subs">+ ${cat.subcategories.length} تصنيف فرعي</button>
                </div>
                <ul class="category-sublist">
                    ${cat.subcategories.map(sub => `<li>${sub}</li>`).join('')}
                </ul>
            </div>
        `;

        card.addEventListener('click', () => {
            filterByCategory(cat.id);
        });

        grid.appendChild(card);

        // Animation
        gsap.from(card, {
            opacity: 0,
            x: 50,
            duration: 0.4,
            ease: 'power2.out',
            delay: 0.1 + index * 0.05
        });
    });
}

// ============================================
// رسم التذييل
// ============================================
function renderFooter() {
    // التصنيفات
    elements.footerCategories.innerHTML = CATEGORIES.map(cat =>
        `<li><a href="#" onclick="filterByCategory('${cat.id}')">${cat.name}</a></li>`
    ).join('');

    // الوسوم الشائعة
    const tags = new Set();
    RESOURCES.forEach(r => r.tags?.forEach(t => tags.add(t)));
    elements.footerTags.innerHTML = Array.from(tags).slice(0, 20).map(tag =>
        `<button class="tag-chip magnetic-btn" onclick="searchByTag('${tag}')">${tag}</button>`
    ).join('');
}

// ============================================
// البحث
// ============================================
function handleSearch(e) {
    e.preventDefault();
    const query = elements.searchInputHeader.value.trim();
    state.searchQuery = query;
    state.currentPage = 1;

    if (!query) {
        showAllResources();
        return;
    }

    performSearch(query);
}

function handleInput() {
    const query = elements.searchInputHeader.value.trim();
    if (query.length >= 2) {
        // يمكن إضافة البحث المقترحات هنا
    }
}

async function performSearch(query) {
    state.searching = true;
    showLoading();

    // 1) نتائج المكتبة المحلية
    const results = searchResources(query);
    displayResults(results, query);

    // 2) نتائج الإنترنت الحية (Exa)
    await performLiveSearch(query, results.length);

    state.searching = false;
    hideLoading();
}

// ============================================
// البحث الحي عبر Exa
// ============================================
async function performLiveSearch(query, localCount) {
    const section = elements.liveResultsSection;
    const grid = elements.liveResultsGrid;
    const status = elements.liveResultsStatus;
    if (!section || !grid || !status) return;

    // إلغاء أي طلب سابق قبل بدء طلب جديد
    if (liveSearchController) {
        liveSearchController.abort();
    }
    liveSearchController = new AbortController();

    grid.innerHTML = '';

    if (!query) {
        section.hidden = true;
        return;
    }

    section.hidden = false;
    status.hidden = false;
    status.className = 'live-results-status loading';
    status.textContent = 'جاري البحث في الإنترنت...';

    const startedAt = performance.now();

    try {
        const response = await fetch(
            `${EXA_ENDPOINT}?query=${encodeURIComponent(query)}&numResults=${state.liveResultsPerPage}`,
            { signal: liveSearchController.signal, headers: { 'Accept': 'application/json' } }
        );

        let payload = null;
        try {
            payload = await response.json();
        } catch (e) {
            payload = null;
        }

        if (!response.ok) {
            const code = payload?.error || `HTTP_${response.status}`;
            showLiveMessage(getLiveErrorMessage(code, payload));
            return;
        }

        const results = Array.isArray(payload?.results) ? payload.results : [];
        if (results.length === 0) {
            showLiveMessage('لم يعثر Exa على نتائج حية لهذا البحث. جرّب كلمات مفتاحية أخرى.');
            return;
        }

        const seconds = ((performance.now() - startedAt) / 1000).toFixed(2);
        status.hidden = false;
        status.className = 'live-results-status';
        status.innerHTML = `تم العثور على <strong>${results.length}</strong> نتيجة من الإنترنت في ${seconds} ثانية`;

        // إخفاء رسالة "لا توجد نتائج" إذا كانت المكتبة المحلية فارغة
        if (localCount === 0) {
            elements.noResults.hidden = true;
        }

        results.forEach((hit, index) => {
            const card = createLiveResultCard(hit);
            grid.appendChild(card);

            gsap.from(card, {
                opacity: 0,
                y: 30,
                duration: 0.4,
                ease: 'power2.out',
                delay: 0.05 + index * 0.03
            });
        });
    } catch (err) {
        if (err && err.name === 'AbortError') return;
        showLiveMessage('تعذّر الاتصال بخدمة البحث الحية (Exa). تأكد من تشغيل الخادم عبر: node server.js');
    }
}

function showLiveMessage(message) {
    const status = elements.liveResultsStatus;
    if (!status) return;
    status.hidden = false;
    status.className = 'live-results-status error';
    status.textContent = message;
}

function clearLiveResults() {
    if (liveSearchController) {
        liveSearchController.abort();
        liveSearchController = null;
    }
    if (elements.liveResultsGrid) {
        elements.liveResultsGrid.innerHTML = '';
    }
    if (elements.liveResultsStatus) {
        elements.liveResultsStatus.hidden = true;
        elements.liveResultsStatus.textContent = '';
    }
    if (elements.liveResultsSection) {
        elements.liveResultsSection.hidden = true;
    }
}

function getLiveErrorMessage(code, payload) {
    switch (code) {
        case 'EXA_API_KEY_MISSING':
            return 'البحث الحي غير مُهيأ: أضف مفتاح EXA_API_KEY في ملف .env ثم أعد تشغيل الخادم.';
        case 'EXA_AUTH_ERROR':
            return 'مفتاح Exa API غير صالح أو منتهي. تحقّق من قيمة EXA_API_KEY.';
        case 'EXA_RATE_LIMITED':
            return 'تم تجاوز حد الاستخدام لدى Exa. حاول مرة أخرى بعد قليل.';
        default:
            return `تعذّر جلب النتائج الحية من Exa${payload?.message ? ': ' + payload.message : ''}.`;
    }
}

function createLiveResultCard(hit) {
    const div = document.createElement('div');
    div.className = 'resource-card live-card';

    const meta = [hit.author, hit.publishedDate]
        .filter(Boolean)
        .map(item => escapeHtml(String(item)))
        .join(' • ');

    div.innerHTML = `
        <div class="resource-header">
            <div class="resource-type-badge live-badge">نتيجة إنترنت</div>
            <span class="live-domain">${escapeHtml(hit.domain || '')}</span>
        </div>
        <div class="resource-content">
            <h3 class="resource-name">
                <a href="${escapeHtml(hit.url || '#')}" target="_blank" rel="noopener noreferrer" class="resource-link">
                    ${escapeHtml(hit.title || hit.url || '')}
                </a>
            </h3>
            ${hit.snippet ? `<p class="resource-desc">${escapeHtml(hit.snippet)}</p>` : ''}
            ${meta ? `<p class="live-meta">${meta}</p>` : ''}
        </div>
        <div class="resource-footer">
            <span class="resource-access free">متاح على الويب</span>
            <a href="${escapeHtml(hit.url || '#')}" target="_blank" rel="noopener noreferrer" class="resource-visit-btn shimmer-btn">
                فتح الرابط
            </a>
        </div>
    `;

    return div;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function searchResources(query) {
    const start = (state.currentPage - 1) * state.resultsPerPage;
    const end = start + state.resultsPerPage;

    let filtered = RESOURCES;

    // تصفية حسب التصنيف النشط
    if (state.selectedCategory) {
        filtered = filtered.filter(r => r.category === state.selectedCategory);
    }

    // بحث النص
    if (query) {
        const queryAr = query.toLowerCase();
        filtered = filtered.filter(r =>
            r.name.toLowerCase().includes(queryAr) ||
            r.nameAr?.toLowerCase().includes(queryAr) ||
            r.description.toLowerCase().includes(queryAr) ||
            r.descriptionAr?.toLowerCase().includes(queryAr) ||
            r.tags?.some(t => t.toLowerCase().includes(queryAr)) ||
            r.subcategory?.toLowerCase().includes(queryAr)
        );
    }

    // تطبيق الفلاتر
    if (state.filters.type.length > 0) {
        filtered = filtered.filter(r => state.filters.type.includes(r.type));
    }
    if (state.filters.platform.length > 0) {
        filtered = filtered.filter(r =>
            r.platform === 'web' || state.filters.platform.includes(r.platform)
        );
    }
    if (state.filters.language.length > 0) {
        filtered = filtered.filter(r => state.filters.language.includes(r.language));
    }
    if (state.filters.access.length > 0) {
        filtered = filtered.filter(r => state.filters.access.includes(r.access));
    }

    // ترتيب: الـ stars ثم الاسم
    filtered.sort((a, b) => (b.stars || 0) - (a.stars || 0));

    state.totalPages = Math.ceil(filtered.length / state.resultsPerPage);

    return filtered.slice(start, end);
}

function displayResults(results, query) {
    elements.resultsSection.hidden = false;
    elements.resultsGrid.innerHTML = '';

    if (results.length === 0) {
        elements.noResults.hidden = false;
        elements.resultsSection.hidden = true;
        elements.pagination.hidden = true;

        elements.searchResultsTitle.textContent = query ? 'لم يتم العثور على نتائج' : 'لا توجد نتائج';
        elements.resultsCount.textContent = '0 مورد';
        return;
    }

    elements.noResults.hidden = true;

    elements.searchResultsTitle.textContent = query ?
        `نتائج البحث عن "${query}"` :
        (state.selectedCategory ?
            CATEGORIES.find(c => c.id === state.selectedCategory)?.name || 'الموارد' :
            'جميع الموارد');

    elements.resultsCount.textContent = `${results.length} مورد${results.length > 1 ? 'ًا' : ''}`;

    const scrollContainer = document.querySelector('.scroll-container');
    if (scrollContainer) {
        scrollContainer.scrollTop = 0;
    }

    results.forEach((resource, index) => {
        const card = createResultCard(resource);
        elements.resultsGrid.appendChild(card);

        // تأخير Animation
        gsap.from(card, {
            opacity: 0,
            y: 30,
            duration: 0.4,
            ease: 'power2.out',
            delay: 0.05 + index * 0.02
        });
    });

    setupPagination();
}

function createResultCard(resource) {
    const div = document.createElement('div');
    div.className = 'resource-card magnetic-btn';
    div.dataset.id = resource.id;

    const stars = resource.stars || 0;
    const safetyClass = resource.safety === 'excellent' ? 'safe-excellent' :
                        resource.safety === 'good' ? 'safe-good' : 'safe-caution';

    div.innerHTML = `
        <div class="resource-header">
            <div class="resource-type-badge">${resource.category}</div>
            <div class="resource-stars" title="${stars} من 5">
                ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}
            </div>
        </div>
        <div class="resource-content">
            <h3 class="resource-name">
                <a href="${resource.url}" target="_blank" rel="noopener noreferrer" class="resource-link">
                    ${resource.name}
                </a>
            </h3>
            <p class="resource-name-ar">${resource.nameAr || ''}</p>
            <p class="resource-desc">${resource.description}</p>
            <p class="resource-desc-ar">${resource.descriptionAr || ''}</p>
        </div>
        <div class="resource-footer">
            <div class="resource-tags">
                ${(resource.tags || []).slice(0, 4).map(tag =>
                    `<span class="resource-tag">${tag}</span>`
                ).join('')}
            </div>
            <div class="resource-meta">
                <span class="resource-platform">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    ${resource.platform || 'web'}
                </span>
                <span class="resource-language">${resource.language || 'متعدد'}</span>
                <span class="resource-access ${resource.access === 'مجاني' ? 'free' : ''}">
                    ${resource.access || 'مجاني'}
                </span>
                <span class="resource-safety ${safetyClass}" title="${resource.safety}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                </span>
            </div>
            <a href="${resource.url}" target="_blank" rel="noopener noreferrer" class="resource-visit-btn shimmer-btn">
                زيارة الموقع
            </a>
        </div>
    `;

    // إضافة speaker notes عند hover
    div.addEventListener('mouseenter', () => {
        gsap.to(div.querySelector('.resource-content'), {
            x: -5,
            duration: 0.2,
            ease: 'power2.out'
        });
    });

    div.addEventListener('mouseleave', () => {
        gsap.to(div.querySelector('.resource-content'), {
            x: 0,
            duration: 0.2,
            ease: 'power2.out'
        });
    });

    return div;
}

// ============================================
// الفلاتر
// ============================================
function showFilters() {
    elements.filtersSection.hidden = false;
}

function hideFilters() {
    elements.filtersSection.hidden = true;
}

function clearFilters() {
    state.filters = { type: [], platform: [], language: [], access: [] };
    renderFilterChips();
    if (state.searchQuery) {
        performSearch(state.searchQuery);
    } else {
        showAllResources();
    }
}

function renderFilterChips() {
    const chips = document.getElementById('filterChips');
    chips.innerHTML = '';

    const filterTypes = [
        { key: 'type', options: ['website', 'software'], labels: ['مواقع', 'برامج'] },
        { key: 'platform', options: ['web', 'PC', 'موبايل'], labels: ['ويب', 'PC', 'موبايل'] },
        { key: 'language', options: ['عربي', 'إنجليزي', 'متعدد'], labels: ['عربي', 'إنجليزي', 'متعدد'] },
        { key: 'access', options: ['مجاني', 'مجاني/مدفوع'], labels: ['مجاني', 'مدفوع'] }
    ];

    filterTypes.forEach(ft => {
        const section = document.createElement('div');
        section.className = 'filter-section';

        const label = document.createElement('span');
        label.className = 'filter-label';
        label.textContent = ft.labels[0];
        section.appendChild(label);

        const options = document.createElement('div');
        options.className = 'filter-options';

        ft.options.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = `filter-chip ${state.filters[ft.key]?.includes(opt) ? 'active' : ''}`;
            btn.textContent = ft.labels[i];
            btn.onclick = () => toggleFilter(ft.key, opt, btn);
            options.appendChild(btn);
        });

        section.appendChild(options);
        chips.appendChild(section);
    });
}

function toggleFilter(key, value, btn) {
    if (!state.filters[key]) state.filters[key] = [];

    const idx = state.filters[key].indexOf(value);
    if (idx > -1) {
        state.filters[key].splice(idx, 1);
        btn.classList.remove('active');
    } else {
        state.filters[key].push(value);
        btn.classList.add('active');
    }

    if (state.searchQuery) {
        performSearch(state.searchQuery);
    } else {
        showAllResources();
    }
}

function showAllResources() {
    clearLiveResults();
    state.selectedCategory = null;
    hideFilters();
    elements.resultsSection.hidden = false;
    elements.resultsGrid.innerHTML = '';

    const allSorted = [...RESOURCES].sort((a, b) => (b.stars || 0) - (a.stars || 0));

    allSorted.slice(0, state.resultsPerPage).forEach((resource, index) => {
        const card = createResultCard(resource);
        elements.resultsGrid.appendChild(card);
    });

    elements.resultsCount.textContent = `${RESOURCES.length} موردًا`;
    elements.searchResultsTitle.textContent = 'جميع الموارد المجانية';
}

// ============================================
// التصفح حسب التصنيف
// ============================================
function filterByCategory(categoryId) {
    clearLiveResults();
    state.selectedCategory = categoryId;
    state.currentPage = 1;
    state.searchQuery = '';
    elements.searchInputHeader.value = '';

    const cat = CATEGORIES.find(c => c.id === categoryId);
    elements.searchResultsTitle.textContent = cat?.name || 'الموارد';
    elements.resultsCount.textContent = `${cat?.count || 0} موردًا`;

    showFilters();

    const filtered = RESOURCES.filter(r => r.category === categoryId);
    displayResults(filtered, '');
}

// ============================================
// البحث حسب الوسم
// ============================================
function searchByTag(tag) {
    elements.searchInputHeader.value = tag;
    performSearch(tag);
}

// ============================================
// تبديل تبويب البحث
// ============================================
function switchSearchTab(tab) {
    state.activeTab = tab;
    state.searchQuery = '';

    document.querySelectorAll('.search-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });

    elements.searchInputHeader.value = '';
    elements.searchInputHeader.placeholder = getTabPlaceholder(tab);

    // إظهار/إخفاء نتائج حسب التبويب
    if (tab === 'all') {
        showAllResources();
    } else {
        filterByCategory(tab);
    }
}

function getTabPlaceholder(tab) {
    const placeholders = {
        all: 'ابحث عن كتب، ألعاب، برامج، فيجن...',
        books: 'ابحث عن الكتب والمواد الدراسية',
        games: 'ابحث عن الألعاب والـ ROMs',
        software: 'ابحث عن البرامج والتطبيقات',
        video: 'ابحث عن الفيديوهات والمحتوى',
        education: 'ابحث عن موارد تعليمية'
    };
    return placeholders[tab] || placeholders.all;
}

// ============================================
// التصفح
// ============================================
function setupPagination() {
    elements.pagination.hidden = state.totalPages <= 1;

    elements.pageNumbers.innerHTML = '';
    for (let i = 1; i <= state.totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = `page-number ${i === state.currentPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.onclick = () => goToPage(i);
        elements.pageNumbers.appendChild(btn);
    }

    elements.prevPage.disabled = state.currentPage <= 1;
    elements.nextPage.disabled = state.currentPage >= state.totalPages;
}

function changePage(delta) {
    const newPage = state.currentPage + delta;
    if (newPage >= 1 && newPage <= state.totalPages) {
        goToPage(newPage);
    }
}

function goToPage(page) {
    state.currentPage = page;
    if (state.searchQuery) {
        performSearch(state.searchQuery);
    } else if (state.selectedCategory) {
        const filtered = RESOURCES.filter(r => r.category === state.selectedCategory);
        displayResults(filtered, '');
    } else {
        showAllResources();
    }
}

// ============================================
// التحميل وإظهار حالة التحميل
// ============================================
function showLoading() {
    elements.loading.hidden = false;
}

function hideLoading() {
    elements.loading.hidden = true;
}

// ============================================
// التحكم بالتذييل
// ============================================
function scrollToCategories() {
    document.querySelector('.categories-section')?.scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// GSAP Animations
// ============================================
function initScrollAnimations() {
    gsap.registerPlugin(ScrollTrigger);

    let lenis = null;
    try {
        lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        });

        document.documentElement.classList.add('lenis');
        document.body.classList.add('lenis');

        lenis.on('scroll', () => {
            ScrollTrigger.update();
        });

        gsap.ticker.add((time) => {
            lenis?.raf(time);
        });
    } catch (e) {
        console.log('Lenis not available');
    }

    // Logo animation
    gsap.from('.logo-icon', {
        scale: 0,
        duration: 0.8,
        ease: 'back.out(1.7)',
        delay: 0.2
    });

    gsap.from('.logo-text', {
        opacity: 0,
        y: -20,
        duration: 0.5,
        ease: 'power2.out',
        delay: 0.4
    });

    gsap.from('.logo-subtitle', {
        opacity: 0,
        y: -10,
        duration: 0.5,
        ease: 'power2.out',
        delay: 0.5
    });

    // Search input
    gsap.from('.search-section-header', {
        opacity: 0,
        y: 30,
        duration: 0.6,
        ease: 'power2.out',
        delay: 0.6
    });

    // Search tabs
    gsap.from('.search-tab', {
        opacity: 0,
        y: 10,
        duration: 0.3,
        stagger: 0.05,
        ease: 'power2.out',
        delay: 0.8
    });

    // Categories
    gsap.utils.toArray('.category-card').forEach((el, i) => {
        gsap.from(el, {
            opacity: 0,
            y: 40,
            duration: 0.5,
            ease: 'power3.out',
            delay: 1 + i * 0.08
        });
    });

    // Scroll-triggered animations
    ScrollTrigger.create({
        trigger: '.categories-section',
        start: 'top 80%',
        onEnter: () => {
            gsap.utils.toArray('.category-card').forEach((el, i) => {
                gsap.from(el, {
                    opacity: 0,
                    y: 40,
                    duration: 0.5,
                    ease: 'power3.out',
                    delay: i * 0.08
                });
            });
        }
    });
}

// ============================================
// إنشاء الخلفية المتحركة
// ============================================
function createBgParticles() {
    const bg = document.getElementById('animatedBg');
    if (!bg) return;

    const colors = ['#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#6366F1'];

    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'bg-particle';
        particle.style.width = (10 + Math.random() * 30) + 'px';
        particle.style.height = particle.style.width;
        particle.style.left = (Math.random() * 100) + '%';
        particle.style.top = (Math.random() * 100) + '%';
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.animationDelay = (Math.random() * 10) + 's';
        particle.style.animationDuration = (20 + Math.random() * 20) + 's';
        particle.style.opacity = 0.03 + Math.random() * 0.05;
        particle.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        bg.appendChild(particle);
    }
}

// ============================================
// المصادفة الصوتية (اختياري)
// ============================================
let speechRecognition = null;

function toggleVoiceSearch() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('البحث الصوتي غير مدعوم في متصفحك. حاول استخدام Chrome أو Edge.');
        return;
    }

    if (state.voiceSearchActive) {
        // إيقاف
        stopVoiceSearch();
        return;
    }

    // إبدأ
    startVoiceSearch();
}

function startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognition = new SpeechRecognition();

    speechRecognition.lang = 'ar-SA';
    speechRecognition.interimResults = true;
    speechRecognition.continuous = true;

    const micBtn = document.querySelector('.mic-btn-lg');
    const micIcon = micBtn?.querySelector('.mic-icon');

    if (micIcon) {
        micIcon.style.animation = 'pulse 1s ease-in-out infinite';
    }

    state.voiceSearchActive = true;

    speechRecognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }

        if (transcript) {
            elements.searchInputHeader.value = transcript;
            // يمكن إضافة بحث تلاقي هنا
        }
    };

    speechRecognition.onerror = (event) => {
        console.error('Speech error:', event.error);
        stopVoiceSearch();
    };

    speechRecognition.start();
}

function stopVoiceSearch() {
    if (speechRecognition) {
        try {
            speechRecognition.stop();
        } catch (e) {
            // ignore
        }
    }

    const micIcon = document.querySelector('.mic-icon');
    if (micIcon) {
        micIcon.style.animation = '';
    }

    state.voiceSearchActive = false;
}

// ============================================
// مذكرات عينة
// ============================================
function initTestimonials() {
    console.log('%c📚 مكتبة الموارد المجانية جاهزة!',
        'color: #8B5CF6; font-size: 16px; font-weight: bold;');
    console.log('%cابحث عن: كتب، ألعاب، برامج، فيجن، تعليم...',
        'color: #10B981;');
}

// ============================================
// التصدير
// ============================================
window.ResourceSearch = {
    searchResources,
    performLiveSearch,
    filterByCategory,
    searchByTag,
    switchSearchTab,
    CATEGORIES,
    RESOURCES
};

// إنشاء الخلفية بعد التحميل
setTimeout(createBgParticles, 100);
