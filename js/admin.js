// 文件路径：js/admin.js

import { 
    supabase, login, logout, checkSession, uploadImage,
    addItem, updateItem, deleteItem, getList, getItemById 
} from './api.js';

let quill;

// DOM 加载完成
document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. 鉴权
    const session = await checkSession();
    if (!session) {
        document.getElementById('login-modal').classList.remove('hidden');
    } else {
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        document.getElementById('sidebar').classList.add('flex');
        document.getElementById('currentUser').innerText = session.user.email;
        initAdmin(); 
    }

    // 2. 登录绑定
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('loginBtn');
        const err = document.getElementById('loginError');
        btn.innerText = "登录中..."; btn.disabled = true;
        try {
            await login(document.getElementById('email').value, document.getElementById('password').value);
            window.location.reload(); 
        } catch (e) {
            err.innerText = e.message; err.classList.remove('hidden');
            btn.innerText = "登录后台"; btn.disabled = false;
        }
    });

    // 3. 退出绑定
    document.getElementById('logoutBtn').onclick = async () => {
        if(confirm("确定要退出登录并返回首页吗？")) {
            await logout();
            window.location.href = 'index.html';
        }
    };
});

async function initAdmin() {
    // 1. 初始化 Quill
    quill = new Quill('#editor-container', {
        theme: 'snow',
        placeholder: '在此输入正文...',
        modules: { toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['link', 'image']] }
    });

    // 2. 加载数据
    loadNews();
    loadActs();
    loadProjs();
    loadStds(); // 新增：加载标准数据

    // 3. 启动自动暂存
    initAutoSave('news', ['newsTitle', 'newsCategory', 'newsSummary'], () => quill.root.innerHTML);
    initAutoSave('act', ['actTitle', 'actDate', 'actLoc', 'actSummary']);
    initAutoSave('proj', ['projName', 'projType', 'projStage', 'projRole', 'projContent']);
    initAutoSave('std', ['stdCode', 'stdTitle', 'stdType', 'stdStatus', 'stdPublishDate', 'stdImplementDate', 'stdDepartment', 'stdDescription']);

    // 4. 绑定提交
    bindSubmit('newsForm', 'articles', getNewsData, loadNews, 'news');
    bindSubmit('actForm', 'activities', getActData, loadActs, 'act');
    bindSubmit('projForm', 'projects', getProjData, loadProjs, 'proj');

    // 5. 绑定搜索
    document.getElementById('searchNews').oninput = debounce(() => loadNews());
    document.getElementById('searchAct').oninput = debounce(() => loadActs());
    document.getElementById('searchProj').oninput = debounce(() => loadProjs());
    document.getElementById('searchStd').oninput = debounce(() => loadStds()); // 新增
}

// =================== 数据获取 ===================
const getNewsData = async () => {
    const file = document.getElementById('newsCover').files[0];
    const imageUrl = file ? await uploadImage(file) : null;
    return {
        title: document.getElementById('newsTitle').value,
        category: document.getElementById('newsCategory').value,
        summary: document.getElementById('newsSummary').value,
        content: quill.root.innerHTML,
        ...(imageUrl && { image_url: imageUrl })
    };
};
const getActData = async () => {
    const file = document.getElementById('actImg').files[0];
    const imageUrl = file ? await uploadImage(file) : null;
    return {
        title: document.getElementById('actTitle').value,
        date_range: document.getElementById('actDate').value,
        location: document.getElementById('actLoc').value,
        summary: document.getElementById('actSummary').value,
        ...(imageUrl && { image_url: imageUrl })
    };
};
const getProjData = async () => ({
    name: document.getElementById('projName').value,
    type: document.getElementById('projType').value,
    stage: document.getElementById('projStage').value,
    role: document.getElementById('projRole').value,
    content: document.getElementById('projContent').value
});

// 通用提交
function bindSubmit(formId, table, dataFn, reloadFn, prefix) {
    document.getElementById(formId).addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById(`${prefix}Id`).value;
        const btn = document.querySelector(`#${formId} button[type="submit"]`);
        const originalText = btn.innerText;
        btn.innerText = "处理中..."; btn.disabled = true;

        try {
            const data = await dataFn();
            if (id) {
                await updateItem(table, id, data);
                alert("修改成功");
            } else {
                await addItem(table, data);
                alert("发布成功");
            }
            clearDraft(prefix);
            cancelEdit(prefix); 
            reloadFn();
        } catch (err) {
            alert("错误: " + err.message);
        } finally {
            btn.innerText = originalText; btn.disabled = false;
        }
    });
}

// =================== 列表加载 (支持搜索) ===================
window.loadNews = async () => {
    const keyword = document.getElementById('searchNews').value;
    const list = document.getElementById('newsList');
    const data = await getList('articles', keyword, ['title', 'summary']);
    list.innerHTML = data.length ? data.map(item => `
        <li class="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
            <div><span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded mr-2">${item.category}</span>${item.title}</div>
            <div class="space-x-2 text-sm"><button onclick="editItem('news', '${item.id}')" class="text-blue-600">编辑</button><button onclick="delItem('articles', '${item.id}', loadNews)" class="text-red-500">删除</button></div>
        </li>`).join('') : '<li class="text-center text-gray-400 py-2">暂无数据</li>';
};

window.loadActs = async () => {
    const keyword = document.getElementById('searchAct').value;
    const list = document.getElementById('actList');
    const data = await getList('activities', keyword, ['title', 'location']);
    list.innerHTML = data.length ? data.map(item => `
        <li class="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
            <div><div class="font-medium">${item.title}</div><div class="text-xs text-gray-500">${item.date_range} | ${item.location}</div></div>
            <div class="space-x-2 text-sm"><button onclick="editItem('act', '${item.id}')" class="text-blue-600">编辑</button><button onclick="delItem('activities', '${item.id}', loadActs)" class="text-red-500">删除</button></div>
        </li>`).join('') : '<li class="text-center text-gray-400 py-2">暂无数据</li>';
};

window.loadProjs = async () => {
    const keyword = document.getElementById('searchProj').value;
    const tbody = document.getElementById('projList');
    const data = await getList('projects', keyword, ['name', 'content']);
    tbody.innerHTML = data.length ? data.map(item => `
        <tr class="border-b hover:bg-gray-50">
            <td class="p-3 font-medium">${item.name}</td>
            <td class="p-3 text-sm text-gray-600">${item.type}</td>
            <td class="p-3"><span class="px-2 py-1 bg-green-50 text-green-700 text-xs rounded">${item.stage}</span></td>
            <td class="p-3 text-right space-x-2 text-sm"><button onclick="editItem('proj', '${item.id}')" class="text-blue-600">编辑</button><button onclick="delItem('projects', '${item.id}', loadProjs)" class="text-red-500">删除</button></td>
        </tr>`).join('') : '<tr><td colspan="4" class="text-center py-4 text-gray-400">暂无数据</td></tr>';
};

// =================== 动作：删除 / 编辑 / 撤销 ===================
window.delItem = async (table, id, reloadFn) => {
    if(!confirm("确定要删除吗？")) return;
    try { await deleteItem(table, id); reloadFn(); } catch(e) { alert(e.message); }
};

window.editItem = async (prefix, id) => {
    document.getElementById(`${prefix}FormTitle`).innerText = "编辑模式";
    document.getElementById(`${prefix}CancelBtn`).classList.remove('hidden');
    document.getElementById(`${prefix}DraftTip`).classList.add('hidden'); 

    const map = { 'news': 'articles', 'act': 'activities', 'proj': 'projects' };
    try {
        const data = await getItemById(map[prefix], id);
        document.getElementById(`${prefix}Id`).value = data.id;

        if (prefix === 'news') {
            document.getElementById('newsTitle').value = data.title;
            document.getElementById('newsCategory').value = data.category;
            document.getElementById('newsSummary').value = data.summary;
            quill.root.innerHTML = data.content;
        } else if (prefix === 'act') {
            document.getElementById('actTitle').value = data.title;
            document.getElementById('actDate').value = data.date_range;
            document.getElementById('actLoc').value = data.location;
            document.getElementById('actSummary').value = data.summary;
        } else if (prefix === 'proj') {
            document.getElementById('projName').value = data.name;
            document.getElementById('projType').value = data.type;
            document.getElementById('projStage').value = data.stage;
            document.getElementById('projRole').value = data.role;
            document.getElementById('projContent').value = data.content;
        }
        document.getElementById(`${prefix}Form`).scrollIntoView({ behavior: 'smooth' });
    } catch (e) { alert("读取失败: " + e.message); }
};

window.cancelEdit = (prefix) => {
    document.getElementById(`${prefix}Form`).reset();
    document.getElementById(`${prefix}Id`).value = "";
    document.getElementById(`${prefix}CancelBtn`).classList.add('hidden');
    document.getElementById(`${prefix}FormTitle`).innerText = prefix === 'news' ? '发布新闻' : '新增项目';
    if (prefix === 'news') quill.setContents([]);
    restoreDraft(prefix);
};

// =================== 自动暂存 ===================
function initAutoSave(prefix, fields, contentFn) {
    const save = () => {
        if(document.getElementById(`${prefix}Id`).value) return; 
        const data = {};
        fields.forEach(f => data[f] = document.getElementById(f).value);
        if(contentFn) data.content = contentFn();
        localStorage.setItem(`draft_${prefix}`, JSON.stringify(data));
        document.getElementById(`${prefix}DraftTip`).classList.remove('hidden');
    };
    fields.forEach(f => document.getElementById(f).addEventListener('input', debounce(save, 1000)));
    if(prefix === 'news') quill.on('text-change', debounce(save, 2000));
    restoreDraft(prefix);
}

function restoreDraft(prefix) {
    const raw = localStorage.getItem(`draft_${prefix}`);
    if (!raw || document.getElementById(`${prefix}Id`).value) return;
    const data = JSON.parse(raw);
    Object.keys(data).forEach(key => { const el = document.getElementById(key); if(el) el.value = data[key]; });
    if (prefix === 'news' && data.content) quill.root.innerHTML = data.content;
    document.getElementById(`${prefix}DraftTip`).classList.remove('hidden');
}

function clearDraft(prefix) {
    localStorage.removeItem(`draft_${prefix}`);
    document.getElementById(`${prefix}DraftTip`).classList.add('hidden');
}

function debounce(func, wait = 500) {
    let timeout;
    return function (...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); };
}

// ================= 标准管理相关函数 =================

// 在 admin.js 中添加以下函数（需要添加到合适的位置）

// ================= 标准数据获取 =================
const getStdData = async () => {
    const file = document.getElementById('stdPdf').files[0];
    let pdfUrl = null;
    
    if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `std_${Date.now()}_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
        const { error } = await supabase.storage.from('standards-pdf').upload(fileName, file);
        if (error) throw error;
        const { data } = supabase.storage.from('standards-pdf').getPublicUrl(fileName);
        pdfUrl = data.publicUrl;
    }
    
    return {
        code: document.getElementById('stdCode').value,
        title: document.getElementById('stdTitle').value,
        type: document.getElementById('stdType').value,
        status: document.getElementById('stdStatus').value,
        publish_date: document.getElementById('stdPublishDate').value || null,
        implement_date: document.getElementById('stdImplementDate').value || null,
        department: document.getElementById('stdDepartment').value,
        description: document.getElementById('stdDescription').value,
        ...(pdfUrl && { pdf_url: pdfUrl })
    };
};

// ================= 加载标准列表 =================
window.loadStds = async () => {
    const keyword = document.getElementById('searchStd').value;
    const tbody = document.getElementById('stdList');
    try {
        const data = await getList('standards', keyword, ['code', 'title', 'description']);
        
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-400">暂无标准数据</td></tr>';
            return;
        }
        
        const statusMap = {
            'active': '<span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">现行</span>',
            'draft': '<span class="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">征求意见</span>',
            'upcoming': '<span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">即将实施</span>',
            'expired': '<span class="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">已废止</span>'
        };
        
        const typeMap = {
            'GB': '国家标准',
            'QC': '行业标准',
            'DB': '地方标准',
            'T': '团体标准',
            'other': '其他'
        };
        
        tbody.innerHTML = data.map(item => `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 font-mono text-sm">${item.code}</td>
                <td class="p-3 font-medium">${item.title}</td>
                <td class="p-3">${typeMap[item.type] || item.type}</td>
                <td class="p-3">${statusMap[item.status] || item.status}</td>
                <td class="p-3">${item.publish_date ? new Date(item.publish_date).toLocaleDateString() : '-'}</td>
                <td class="p-3 space-x-2">
                    <button onclick="editStd('${item.id}')" class="text-blue-600 hover:text-blue-800 text-sm">编辑</button>
                    <button onclick="delItem('standards', '${item.id}', loadStds)" class="text-red-500 hover:text-red-700 text-sm">删除</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-red-500">加载失败</td></tr>';
        console.error('加载标准失败:', error);
    }
};

// ================= 编辑标准 =================
window.editStd = async (id) => {
    document.getElementById('stdFormTitle').innerText = "编辑标准";
    document.getElementById('stdCancelBtn').classList.remove('hidden');
    document.getElementById('stdDraftTip').classList.add('hidden');
    
    try {
        const data = await getItemById('standards', id);
        if (!data) throw new Error('标准不存在');
        
        document.getElementById('stdId').value = data.id;
        document.getElementById('stdCode').value = data.code || '';
        document.getElementById('stdTitle').value = data.title || '';
        document.getElementById('stdType').value = data.type || '';
        document.getElementById('stdStatus').value = data.status || '';
        document.getElementById('stdPublishDate').value = data.publish_date || '';
        document.getElementById('stdImplementDate').value = data.implement_date || '';
        document.getElementById('stdDepartment').value = data.department || '';
        document.getElementById('stdDescription').value = data.description || '';
        
        document.getElementById('stdForm').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        alert("读取失败: " + error.message);
    }
};

// ================= 绑定标准表单提交 =================
document.getElementById('stdForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('stdId').value;
    const btn = document.querySelector('#stdForm button[type="submit"]');
    const originalText = btn.innerText;
    
    btn.innerText = "处理中..."; 
    btn.disabled = true;
    
    try {
        const data = await getStdData();
        if (id) {
            await updateItem('standards', id, data);
            alert("标准修改成功");
        } else {
            await addItem('standards', data);
            alert("标准添加成功");
        }
        clearDraft('std');
        cancelEditStd();
        loadStds();
    } catch (err) {
        alert("错误: " + err.message);
    } finally {
        btn.innerText = originalText; 
        btn.disabled = false;
    }
});

// ================= 取消编辑标准 =================
window.cancelEditStd = () => {
    document.getElementById('stdForm').reset();
    document.getElementById('stdId').value = "";
    document.getElementById('stdCancelBtn').classList.add('hidden');
    document.getElementById('stdFormTitle').innerText = "新增标准";
    restoreDraft('std');
};

// ================= 初始化标准自动保存 =================
initAutoSave('std', ['stdCode', 'stdTitle', 'stdType', 'stdStatus', 'stdPublishDate', 'stdImplementDate', 'stdDepartment', 'stdDescription']);

// ================= 初始化时加载标准 =================
// 在 initAdmin 函数中添加以下代码（需要找到 initAdmin 函数）
// 在 initAdmin 函数的末尾添加：
document.addEventListener('DOMContentLoaded', () => {
    // 在 initAdmin 函数中添加
    if (typeof initStdSearch === 'function') {
        initStdSearch();
    }
});

// 标准搜索初始化
function initStdSearch() {
    const searchStd = document.getElementById('searchStd');
    if (searchStd) {
        searchStd.addEventListener('input', debounce(() => loadStds(), 500));
    }
}