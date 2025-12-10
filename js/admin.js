// 文件路径：js/admin.js

import { 
    supabase, 
    login, 
    logout, 
    checkSession, 
    uploadImage, 
    uploadFile, 
    addItem, 
    updateItem, 
    deleteItem, 
    getList, 
    getItemById 
} from './api.js';

let quillNews;
let quillAct;

// =================== 1. 初始化 ===================
document.addEventListener('DOMContentLoaded', async () => {
    const session = await checkSession();
    if (!session) {
        document.getElementById('login-modal').classList.remove('hidden');
    } else {
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        document.getElementById('sidebar').classList.add('flex');
        if (session.user && session.user.email) {
            document.getElementById('currentUser').innerText = session.user.email;
        }
        initAdmin(); 
    }

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

    document.getElementById('logoutBtn').onclick = async () => {
        if(confirm("确定退出登录？")) {
            await logout();
            window.location.href = 'index.html';
        }
    };
});

// =================== 2. 核心逻辑 ===================
async function initAdmin() {
    // 新闻编辑器
    quillNews = new Quill('#editor-container', {
        theme: 'snow',
        placeholder: '输入新闻内容...',
        modules: { toolbar: [['bold', 'italic', 'underline'], [{'list': 'ordered'}, {'list': 'bullet'}], ['link', 'image'], ['clean']] }
    });

    // 活动详情编辑器
    if(document.getElementById('act-editor-container')) {
        quillAct = new Quill('#act-editor-container', {
            theme: 'snow',
            placeholder: '输入活动回顾...',
            modules: { toolbar: [['bold', 'italic', 'underline'], [{'header': 1}, {'header': 2}], [{'list': 'ordered'}, {'list': 'bullet'}], ['link', 'image'], ['clean']] }
        });
    }

    // 加载数据
    loadNews();
    loadActs();
    loadProjs();
    loadStds();

    // 自动保存配置
    initAutoSave('news', ['newsTitle', 'newsCategory', 'newsSummary'], () => quillNews.root.innerHTML);
    // 活动增加新字段监听
    initAutoSave('act', ['actTitle', 'actCategory', 'actDate', 'actLoc', 'actSummary', 'actOrganizer', 'actContractor', 'actContact'], () => quillAct ? quillAct.root.innerHTML : '');
    initAutoSave('proj', ['projName', 'projType', 'projStage', 'projRole', 'projContent']);
    initAutoSave('std', ['stdCode', 'stdTitle', 'stdType', 'stdStatus', 'stdPublishDate', 'stdImplementDate', 'stdDepartment', 'stdDescription']);

    // 提交绑定
    bindSubmit('newsForm', 'articles', getNewsData, loadNews, 'news');
    bindSubmit('actForm', 'activities', getActData, loadActs, 'act');
    bindSubmit('projForm', 'projects', getProjData, loadProjs, 'proj');
    bindSubmit('stdForm', 'standards', getStdData, loadStds, 'std');

    // 搜索绑定
    document.getElementById('searchNews').oninput = debounce(() => loadNews());
    document.getElementById('searchAct').oninput = debounce(() => loadActs());
    document.getElementById('searchProj').oninput = debounce(() => loadProjs());
    document.getElementById('searchStd').oninput = debounce(() => loadStds());
}

// =================== 3. 数据获取 ===================

const getNewsData = async () => {
    const file = document.getElementById('newsCover').files[0];
    const imageUrl = file ? await uploadImage(file) : null;
    return {
        title: document.getElementById('newsTitle').value,
        category: document.getElementById('newsCategory').value,
        summary: document.getElementById('newsSummary').value,
        content: quillNews.root.innerHTML,
        ...(imageUrl && { image_url: imageUrl })
    };
};

const getActData = async () => {
    const imgFile = document.getElementById('actImg').files[0];
    const imageUrl = imgFile ? await uploadImage(imgFile) : null;
    const docFile = document.getElementById('actFile').files[0];
    const docUrl = docFile ? await uploadFile(docFile, 'activity-files') : null;

    const data = {
        title: document.getElementById('actTitle').value,
        category: document.getElementById('actCategory').value,
        date_range: document.getElementById('actDate').value,
        location: document.getElementById('actLoc').value,
        summary: document.getElementById('actSummary').value,
        // 新增字段
        organizer: document.getElementById('actOrganizer').value || '国家市场监督管理总局技术创新中心',
        contractor: document.getElementById('actContractor').value || '中国汽车工程研究院股份有限公司',
        contact: document.getElementById('actContact').value || 'nevsc@caeri.com.cn',
        
        timeline: getTimelineFromDOM(),
        content: quillAct ? quillAct.root.innerHTML : '',
    };
    if (imageUrl) data.image_url = imageUrl;
    if (docUrl) data.attachment_url = docUrl;
    return data;
};

const getProjData = async () => ({
    name: document.getElementById('projName').value,
    type: document.getElementById('projType').value,
    stage: document.getElementById('projStage').value,
    role: document.getElementById('projRole').value,
    content: document.getElementById('projContent').value
});

const getStdData = async () => {
    const file = document.getElementById('stdPdf').files[0];
    let pdfUrl = null;
    if (file && !document.getElementById('noPdfUpload')?.checked) {
        pdfUrl = await uploadFile(file, 'activity-files'); 
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

function bindSubmit(formId, table, dataFn, reloadFn, prefix) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById(`${prefix}Id`).value;
        const btn = form.querySelector('button[type="submit"]');
        const oldText = btn.innerText;
        btn.innerText = "处理中..."; btn.disabled = true;
        try {
            const data = await dataFn();
            if (id) await updateItem(table, id, data);
            else await addItem(table, data);
            clearDraft(prefix);
            cancelEdit(prefix); 
            reloadFn();
            alert("操作成功");
        } catch (err) { alert("错误: " + err.message); }
        finally { btn.innerText = oldText; btn.disabled = false; }
    });
}

// =================== 5. 列表加载 ===================

// [新闻] - 增加截断样式
window.loadNews = async () => {
    const keyword = document.getElementById('searchNews').value;
    const list = document.getElementById('newsList');
    const data = await getList('articles', keyword, ['title']);
    list.innerHTML = data.length ? data.map(item => `
        <li class="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
            <div class="flex-1 min-w-0 truncate pr-4" title="${item.title}">
                <span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded mr-2 align-middle">${item.category === 'notice' ? '公告' : '新闻'}</span>
                <span class="align-middle text-sm font-medium">${item.title}</span>
            </div>
            <div class="space-x-2 text-xs whitespace-nowrap"><button onclick="editItem('news', '${item.id}')" class="text-blue-600">编辑</button><button onclick="delItem('articles', '${item.id}', loadNews)" class="text-red-500">删除</button></div>
        </li>`).join('') : '<li class="text-center text-gray-400 text-sm py-2">暂无数据</li>';
};

// [活动]
window.loadActs = async () => {
    const keyword = document.getElementById('searchAct').value;
    const list = document.getElementById('actList');
    const data = await getList('activities', keyword, ['title']);
    list.innerHTML = data.length ? data.map(item => {
        // 修改点：移除英文转中文映射，直接显示数据库中的中文分类
        const catName = item.category || '未分类';
        const catClass = item.category === '揭榜挂帅擂台赛' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';
        return `
        <li class="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
            <div class="flex-1 min-w-0 pr-4">
                <div class="font-medium truncate text-sm flex items-center gap-2">
                    ${item.title}
                    <span class="text-xs px-2 py-0.5 rounded ${catClass}">${catName}</span>
                </div>
                <div class="text-xs text-gray-500 truncate">${item.date_range || ''} | ${item.location || ''}</div>
            </div>
            <div class="space-x-2 text-xs whitespace-nowrap"><button onclick="editItem('act', '${item.id}')" class="text-blue-600">编辑</button><button onclick="delItem('activities', '${item.id}', loadActs)" class="text-red-500">删除</button></div>
        </li>`;
    }).join('') : '<li class="text-center text-gray-400 text-sm py-2">暂无数据</li>';
};

// [课题]
window.loadProjs = async () => {
    const keyword = document.getElementById('searchProj').value;
    const tbody = document.getElementById('projList');
    const data = await getList('projects', keyword, ['name']);
    tbody.innerHTML = data.length ? data.map(item => `
        <tr class="border-b hover:bg-gray-50">
            <td class="p-3 font-medium truncate max-w-xs" title="${item.name}">${item.name}</td>
            <td class="p-3 text-sm text-gray-600">${item.type}</td>
            <td class="p-3"><span class="px-2 py-1 bg-green-50 text-green-700 text-xs rounded">${item.stage}</span></td>
            <td class="p-3 text-right space-x-2 text-sm whitespace-nowrap"><button onclick="editItem('proj', '${item.id}')" class="text-blue-600">编辑</button><button onclick="delItem('projects', '${item.id}', loadProjs)" class="text-red-500">删除</button></td>
        </tr>`).join('') : '<tr><td colspan="4" class="text-center py-4 text-gray-400 text-sm">暂无数据</td></tr>';
};

// [标准] - 状态转中文
window.loadStds = async () => {
    const keyword = document.getElementById('searchStd').value;
    const tbody = document.getElementById('stdList');
    const data = await getList('standards', keyword, ['code', 'title']);
    const typeMap = { 'GB': '国家标准', 'QC': '行业标准', 'DB': '地方标准', 'T': '团体标准', 'other': '其他' };
    const statusMap = {
        'active': '<span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">现行</span>',
        'draft': '<span class="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">征求意见</span>',
        'upcoming': '<span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">即将实施</span>',
        'expired': '<span class="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">已废止</span>'
    };
    tbody.innerHTML = data.length ? data.map(item => `
        <tr class="border-b hover:bg-gray-50">
            <td class="p-3 font-mono text-sm">${item.code}</td>
            <td class="p-3 font-medium truncate max-w-xs" title="${item.title}">${item.title}</td>
            <td class="p-3 text-sm text-gray-600">${typeMap[item.type] || item.type}</td>
            <td class="p-3 text-sm">${statusMap[item.status] || item.status}</td>
            <td class="p-3 text-sm">${item.publish_date ? new Date(item.publish_date).toLocaleDateString() : '-'}</td>
            <td class="p-3 space-x-2 text-sm text-right whitespace-nowrap">
                <button onclick="editItem('std', '${item.id}')" class="text-blue-600">编辑</button>
                <button onclick="delItem('standards', '${item.id}', loadStds)" class="text-red-500">删除</button>
            </td>
        </tr>`).join('') : '<tr><td colspan="6" class="text-center py-4 text-gray-400 text-sm">暂无数据</td></tr>';
};

// =================== 6. 操作逻辑 ===================

window.delItem = async (table, id, reloadFn) => {
    if(!confirm("确定删除？")) return;
    try { await deleteItem(table, id); reloadFn(); } catch(e) { alert("删除失败: " + e.message); }
};

window.editItem = async (prefix, id) => {
    document.getElementById(`${prefix}FormTitle`).innerText = "编辑模式";
    document.getElementById(`${prefix}CancelBtn`).classList.remove('hidden');
    document.getElementById(`${prefix}DraftTip`).classList.add('hidden'); 
    
    const map = { 'news': 'articles', 'act': 'activities', 'proj': 'projects', 'std': 'standards' };
    const data = await getItemById(map[prefix], id);
    if(!data) return alert("数据不存在");

    document.getElementById(`${prefix}Id`).value = data.id;

    if (prefix === 'news') {
        document.getElementById('newsTitle').value = data.title;
        document.getElementById('newsCategory').value = data.category;
        document.getElementById('newsSummary').value = data.summary || '';
        quillNews.root.innerHTML = data.content || ''; 
    } else if (prefix === 'act') {
        document.getElementById('actTitle').value = data.title;
        document.getElementById('actCategory').value = data.category;
        document.getElementById('actDate').value = data.date_range || '';
        document.getElementById('actLoc').value = data.location || '';
        document.getElementById('actSummary').value = data.summary || '';
        document.getElementById('actOrganizer').value = data.organizer || '';
        document.getElementById('actContractor').value = data.contractor || '';
        document.getElementById('actContact').value = data.contact || '';
        renderTimelineToDOM(data.timeline);
        if (quillAct) quillAct.root.innerHTML = data.content || ''; 
    } else if (prefix === 'proj') {
        document.getElementById('projName').value = data.name;
        document.getElementById('projType').value = data.type;
        document.getElementById('projStage').value = data.stage;
        document.getElementById('projRole').value = data.role || '';
        document.getElementById('projContent').value = data.content || '';
    } else if (prefix === 'std') {
        document.getElementById('stdCode').value = data.code || '';
        document.getElementById('stdTitle').value = data.title || '';
        document.getElementById('stdType').value = data.type || '';
        document.getElementById('stdStatus').value = data.status || '';
        document.getElementById('stdPublishDate').value = data.publish_date || '';
        document.getElementById('stdImplementDate').value = data.implement_date || '';
        document.getElementById('stdDepartment').value = data.department || '';
        document.getElementById('stdDescription').value = data.description || '';
    }
    document.getElementById(`${prefix}Form`).scrollIntoView({ behavior: 'smooth' });
};

window.cancelEdit = (prefix) => {
    document.getElementById(`${prefix}Form`).reset();
    document.getElementById(`${prefix}Id`).value = "";
    document.getElementById(`${prefix}CancelBtn`).classList.add('hidden');
    document.getElementById(`${prefix}FormTitle`).innerText = "新增";
    if (prefix === 'news') quillNews.setContents([]);
    if (prefix === 'act') {
        document.getElementById('timeline-container').innerHTML = '';
        if(quillAct) quillAct.setContents([]);
    }
    restoreDraft(prefix);
};

// =================== 7. 辅助功能 ===================

window.addTimelineRow = (date = '', event = '') => {
    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center timeline-row mb-2';
    div.innerHTML = `<input type="text" placeholder="时间" class="border p-1 rounded text-sm w-1/3" value="${date}">
        <input type="text" placeholder="事件" class="border p-1 rounded text-sm flex-1" value="${event}">
        <button type="button" onclick="this.parentElement.remove()" class="text-red-500 px-2"><i class="fa-solid fa-trash"></i></button>`;
    document.getElementById('timeline-container').appendChild(div);
};

function getTimelineFromDOM() {
    const rows = document.querySelectorAll('.timeline-row');
    const timeline = [];
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        if (inputs[0].value && inputs[1].value) timeline.push({ date: inputs[0].value, event: inputs[1].value });
    });
    return timeline;
}

function renderTimelineToDOM(timelineData) {
    const container = document.getElementById('timeline-container');
    container.innerHTML = ''; 
    if (Array.isArray(timelineData)) timelineData.forEach(item => window.addTimelineRow(item.date, item.event));
}

function initAutoSave(prefix, fields, contentFn) {
    const save = debounce(() => {
        if(document.getElementById(`${prefix}Id`).value) return; 
        const data = {};
        fields.forEach(f => {
            const el = document.getElementById(f);
            if(el) data[f] = el.value;
        });
        if(contentFn) data.content = contentFn();
        localStorage.setItem(`draft_${prefix}`, JSON.stringify(data));
        document.getElementById(`${prefix}DraftTip`).classList.remove('hidden');
    }, 1000);

    fields.forEach(f => {
        const el = document.getElementById(f);
        if(el) el.addEventListener('input', save);
    });
    
    if(prefix === 'news' && quillNews) quillNews.on('text-change', save);
    if(prefix === 'act' && quillAct) quillAct.on('text-change', save);
    
    restoreDraft(prefix);
}

function restoreDraft(prefix) {
    const raw = localStorage.getItem(`draft_${prefix}`);
    if (!raw || document.getElementById(`${prefix}Id`).value) return;
    try {
        const data = JSON.parse(raw);
        Object.keys(data).forEach(key => { 
            const el = document.getElementById(key); 
            if(el && key !== 'content') el.value = data[key]; 
        });
        if (prefix === 'news' && data.content) quillNews.root.innerHTML = data.content;
        if (prefix === 'act' && data.content && quillAct) quillAct.root.innerHTML = data.content;
        document.getElementById(`${prefix}DraftTip`).classList.remove('hidden');
    } catch(e) {}
}

function clearDraft(prefix) {
    localStorage.removeItem(`draft_${prefix}`);
    document.getElementById(`${prefix}DraftTip`).classList.add('hidden');
}

function debounce(func, wait = 500) {
    let timeout;
    return function (...args) { 
        clearTimeout(timeout); 
        timeout = setTimeout(() => func.apply(this, args), wait); 
    };
}