// 文件路径：js/search.js

import { supabase } from './api.js';

document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('global-search-input');
    const searchBtn = document.getElementById('global-search-btn');
    const dropdown = document.getElementById('search-dropdown');

    if (!searchInput || !searchBtn) return;

    let debounceTimer;

    // --- 1. 实时搜索 (Live Search) ---
    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.trim();
        if (!dropdown) return;

        if (query.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => performLiveSearch(query), 300);
    });

    document.addEventListener('click', function(e) {
        if (dropdown && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    async function performLiveSearch(keyword) {
        dropdown.classList.remove('hidden');
        dropdown.innerHTML = '<div class="p-4 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin mr-1"></i> 搜索中...</div>';

        try {
            // 搜索 articles 表 (标题或摘要)
            const { data, error } = await supabase
                .from('articles')
                .select('id, title, category')
                .or(`title.ilike.%${keyword}%,summary.ilike.%${keyword}%`)
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) throw error;

            if (!data || data.length === 0) {
                dropdown.innerHTML = '<div class="p-3 text-center text-gray-400 text-xs">未找到相关内容</div>';
            } else {
                let html = '';
                data.forEach(item => {
                    const highlight = item.title.replace(new RegExp(keyword, 'gi'), m => `<span class="text-[#004098] font-bold">${m}</span>`);
                    html += `
                        <a href="news-detail.html?id=${item.id}" class="flex items-center px-4 py-3 border-b border-gray-50 hover:bg-blue-50/50 transition cursor-pointer decoration-0">
                            <span class="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 mr-2 shrink-0">${item.category === 'notice' ? '公告' : '新闻'}</span>
                            <span class="text-sm text-gray-600 line-clamp-1">${highlight}</span>
                        </a>
                    `;
                });
                html += `<div class="bg-gray-50 p-2 text-center text-xs text-gray-500 cursor-pointer hover:bg-gray-100" onclick="window.location.href='news.html?search=${encodeURIComponent(keyword)}'">查看所有结果 <i class="fa-solid fa-angle-right"></i></div>`;
                dropdown.innerHTML = html;
            }
        } catch (err) {
            dropdown.innerHTML = '<div class="p-3 text-center text-red-400 text-xs">搜索服务不可用</div>';
        }
    }

    // --- 2. 按钮/回车逻辑 (包含暗号验证) ---
    async function handleEnterOrClick() {
        const query = searchInput.value.trim();
        if (!query) return;
        if (dropdown) dropdown.classList.add('hidden');

        const originalIcon = searchBtn.innerHTML;
        searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        searchBtn.disabled = true;

        try {
            // 调用 RPC 验证暗号
            const { data: isMatch } = await supabase.rpc('verify_admin_code', { input_code: query });
            
            if (isMatch === true) {
                window.location.href = 'admin.html';
            } else {
                window.location.href = `news.html?search=${encodeURIComponent(query)}`;
            }
        } catch (err) {
            window.location.href = `news.html?search=${encodeURIComponent(query)}`;
        } finally {
            searchBtn.innerHTML = originalIcon;
            searchBtn.disabled = false;
        }
    }

    searchBtn.addEventListener('click', handleEnterOrClick);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleEnterOrClick();
        }
    });
});