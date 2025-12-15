// 文件路径：js/admin.js

import { 
    supabase, 
    login, 
    logout, 
    checkSession, 
    uploadImage, 
    uploadFile, // <--- 新增导入
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
    // 1.1 鉴权检查
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

    // 1.2 绑定登录表单
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

    // 1.3 绑定退出按钮
    document.getElementById('logoutBtn').onclick = async () => {
        if(confirm("确定退出登录？")) {
            await logout();
            window.location.href = 'index.html';
        }
    };
});

// =================== 2. 核心逻辑初始化 ===================
async function initAdmin() {
    // 2.1 初始化新闻编辑器
    if (document.getElementById('editor-container')) {
        quillNews = new Quill('#editor-container', {
            theme: 'snow',
            placeholder: '输入新闻正文...',
            modules: { toolbar: [['bold', 'italic', 'underline'], [{'list': 'ordered'}, {'list': 'bullet'}], ['link', 'image'], ['clean']] }
        });
    }

    // 2.2 初始化活动详情编辑器
    if (document.getElementById('act-editor-container')) {
        quillAct = new Quill('#act-editor-container', {
            theme: 'snow',
            placeholder: '输入活动回顾/详情...',
            modules: { toolbar: [['bold', 'italic', 'underline'], [{'header': 1}, {'header': 2}], [{'list': 'ordered'}, {'list': 'bullet'}], ['link', 'image'], ['clean']] }
        });
    }

    // 2.3 加载所有列表数据
    loadNews();
    loadActs();
    loadProjs();
    loadStds();

    // 2.4 配置自动保存
    initAutoSave('news', ['newsTitle', 'newsCategory', 'newsSource', 'newsAuthor', 'newsPublishDate', 'newsSummary'], 
        () => quillNews ? quillNews.root.innerHTML : '');
    
    initAutoSave('act', ['actTitle', 'actCategory', 'actDate', 'actLoc', 'actSummary', 'actOrganizer', 'actContractor', 'actContact'], 
        () => quillAct ? quillAct.root.innerHTML : '');
    
    initAutoSave('proj', ['projName', 'projType', 'projStage', 'projRole', 'projContent']);
    
    initAutoSave('std', ['stdCode', 'stdTitle', 'stdType', 'stdStatus', 'stdPublishDate', 'stdImplementDate', 'stdDepartment', 'stdDescription']);

    // 2.5 绑定表单提交事件
    bindSubmit('newsForm', 'articles', getNewsData, loadNews, 'news');
    bindSubmit('actForm', 'activities', getActData, loadActs, 'act');
    bindSubmit('projForm', 'projects', getProjData, loadProjs, 'proj');
    bindSubmit('stdForm', 'standards', getStdData, loadStds, 'std');

    // 2.6 绑定搜索框输入事件 (防抖)
    document.getElementById('searchNews').oninput = debounce(() => loadNews());
    document.getElementById('searchAct').oninput = debounce(() => loadActs());
    document.getElementById('searchProj').oninput = debounce(() => loadProjs());
    document.getElementById('searchStd').oninput = debounce(() => loadStds());
}

// =================== 3. 表单数据获取 ===================

// [新闻数据]
const getNewsData = async () => {
    const file = document.getElementById('newsCover').files[0];
    const imageUrl = file ? await uploadImage(file) : null;
    return {
        title: document.getElementById('newsTitle').value,
        category: document.getElementById('newsCategory').value,
        source: document.getElementById('newsSource').value,
        author: document.getElementById('newsAuthor').value,
        publish_date: document.getElementById('newsPublishDate').value,
        summary: document.getElementById('newsSummary').value,
        content: quillNews ? quillNews.root.innerHTML : '',
        ...(imageUrl && { image_url: imageUrl }) 
    };
};

// [活动数据] - 核心修复：上传 Bucket 和 字段名
const getActData = async () => {
    const imgFile = document.getElementById('actImg').files[0];
    const docFile = document.getElementById('actFile').files[0];
    
    const submitBtn = document.querySelector('#actForm button[type="submit"]');
    const originalText = submitBtn.innerText;

    let imageUrl = null;
    let attachUrl = null;

    // 1. 上传封面图 -> news-images
    if (imgFile) {
        try {
            submitBtn.innerText = "上传图片中...";
            imageUrl = await uploadFile(imgFile, 'news-images');
        } catch (e) {
            alert("封面图上传失败: " + e.message);
            throw e; 
        }
    }

    // 2. 上传附件 -> activity-files
    if (docFile) {
        try {
            submitBtn.innerText = "上传附件中...";
            attachUrl = await uploadFile(docFile, 'activity-files');
        } catch (e) {
            alert("附件上传失败 (请检查 activity-files 存储桶权限): " + e.message);
            throw e;
        }
    }

    submitBtn.innerText = originalText;

    // 3. 构建数据对象
    return {
        title: document.getElementById('actTitle').value,
        category: document.getElementById('actCategory').value,
        date_range: document.getElementById('actDate').value,
        location: document.getElementById('actLoc').value,
        summary: document.getElementById('actSummary').value,
        // 组织机构
        organizer: document.getElementById('actOrganizer').value || '国家市场监督管理总局技术创新中心',
        contractor: document.getElementById('actContractor').value || '中国汽车工程研究院股份有限公司',
        contact: document.getElementById('actContact').value,
        
        // 时间线数据
        timeline: getTimelineFromDOM(), 
        // 富文本
        content: quillAct ? quillAct.root.innerHTML : '',
        
        // 仅当上传新文件时更新 URL
        ...(imageUrl && { image_url: imageUrl }),
        // ⚠️ 修正：数据库字段是 attachment_url
        ...(attachUrl && { attachment_url: attachUrl })   
    };
};

// [课题数据]
const getProjData = async () => ({
    name: document.getElementById('projName').value,
    type: document.getElementById('projType').value,
    stage: document.getElementById('projStage').value,
    role: document.getElementById('projRole').value,
    content: document.getElementById('projContent').value
});

// [标准数据]
const getStdData = async () => {
    const file = document.getElementById('stdPdf').files[0];
    // 标准建议也使用 uploadFile 上传到 standards-pdf，但为了兼容暂时用 uploadImage(news-images) 或者按需修改
    // 这里如果 standards-pdf 桶存在，建议使用: await uploadFile(file, 'standards-pdf');
    // 目前保持原样以免出错，如果需要请手动修改 'news-images' 为 'standards-pdf'
    const pdfUrl = (file && !document.getElementById('noPdfUpload')?.checked) ? await uploadImage(file) : null;
    
    return {
        code: document.getElementById('stdCode').value,
        title: document.getElementById('stdTitle').value,
        type: document.getElementById('stdType').value,
        status: document.getElementById('stdStatus').value,
        publish_date: document.getElementById('stdPublishDate').value || null,
        implement_date: document.getElementById('stdImplementDate').value || null,
        department: document.getElementById('stdDepartment').value,
        description: document.getElementById('stdDescription').value,
        allow_download: document.getElementById('stdAllowDownload').checked,
        ...(pdfUrl && { pdf_url: pdfUrl })
    };
};

// 通用表单提交绑定
function bindSubmit(formId, table, dataFn, reloadFn, prefix) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById(`${prefix}Id`).value;
        const btn = form.querySelector('button[type="submit"]');
        const oldText = btn.innerText;
        
        btn.innerText = "处理中..."; 
        btn.disabled = true;

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
            reloadFn(); // 刷新列表

        } catch (err) {
            console.error(err);
            alert("操作失败: " + err.message);
        } finally {
            btn.innerText = oldText; 
            btn.disabled = false;
        }
    });
}

// =================== 4. 列表加载逻辑 ===================

// [新闻列表]
window.loadNews = async () => {
    const keyword = document.getElementById('searchNews').value;
    const list = document.getElementById('newsList');
    const data = await getList('articles', keyword, ['title']); 
    
    list.innerHTML = data.length ? data.map(item => `
        <li class="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
            <div class="flex-1 min-w-0 truncate pr-4" title="${item.title}">
                <span class="text-xs ${item.category === 'notice' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'} px-2 py-0.5 rounded mr-2 align-middle">
                    ${item.category === 'notice' ? '公告' : '新闻'}
                </span>
                <span class="align-middle text-sm font-medium">${item.title}</span>
            </div>
            <div class="space-x-2 text-xs whitespace-nowrap">
                <button onclick="editItem('news', '${item.id}')" class="text-blue-600 hover:underline">编辑</button>
                <button onclick="delItem('articles', '${item.id}', loadNews)" class="text-red-500 hover:underline">删除</button>
            </div>
        </li>`).join('') : '<li class="text-center text-gray-400 text-sm py-2">暂无数据</li>';
};

// [活动列表]
window.loadActs = async () => {
    const keyword = document.getElementById('searchAct').value;
    const list = document.getElementById('actList');
    const data = await getList('activities', keyword, ['title']);
    
    list.innerHTML = data.length ? data.map(item => {
        const catClass = item.category?.includes('擂台赛') ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';
        return `
        <li class="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
            <div class="flex-1 min-w-0 pr-4">
                <div class="font-medium truncate text-sm flex items-center gap-2">
                    ${item.title}
                    <span class="text-xs px-2 py-0.5 rounded ${catClass}">${item.category || '活动'}</span>
                </div>
                <div class="text-xs text-gray-500 truncate">${item.date_range || ''} | ${item.location || ''}</div>
            </div>
            <div class="space-x-2 text-xs whitespace-nowrap">
                <button onclick="editItem('act', '${item.id}')" class="text-blue-600 hover:underline">编辑</button>
                <button onclick="delItem('activities', '${item.id}', loadActs)" class="text-red-500 hover:underline">删除</button>
            </div>
        </li>`;
    }).join('') : '<li class="text-center text-gray-400 text-sm py-2">暂无数据</li>';
};

// [课题列表]
window.loadProjs = async () => {
    const keyword = document.getElementById('searchProj').value;
    const tbody = document.getElementById('projList');
    const data = await getList('projects', keyword, ['name']);
    
    tbody.innerHTML = data.length ? data.map(item => `
        <tr class="border-b hover:bg-gray-50">
            <td class="p-3 font-medium truncate max-w-xs" title="${item.name}">${item.name}</td>
            <td class="p-3 text-sm text-gray-600">${item.type || '-'}</td>
            <td class="p-3"><span class="px-2 py-1 bg-green-50 text-green-700 text-xs rounded border border-green-200">${item.stage || '进行中'}</span></td>
            <td class="p-3 text-right space-x-2 text-sm whitespace-nowrap">
                <button onclick="editItem('proj', '${item.id}')" class="text-blue-600 hover:underline">编辑</button>
                <button onclick="delItem('projects', '${item.id}', loadProjs)" class="text-red-500 hover:underline">删除</button>
            </td>
        </tr>`).join('') : '<tr><td colspan="4" class="text-center py-4 text-gray-400 text-sm">暂无数据</td></tr>';
};

// [标准列表]
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
            <td class="p-3 font-mono text-sm font-bold text-blue-700">${item.code}</td>
            <td class="p-3 font-medium truncate max-w-xs" title="${item.title}">${item.title}</td>
            <td class="p-3 text-sm text-gray-600">${typeMap[item.type] || item.type}</td>
            <td class="p-3 text-sm">${statusMap[item.status] || item.status}</td>
            <td class="p-3 text-sm">${item.publish_date || '-'}</td>
            <td class="p-3 space-x-2 text-sm text-right whitespace-nowrap">
                <button onclick="editItem('std', '${item.id}')" class="text-blue-600 hover:underline">编辑</button>
                <button onclick="delItem('standards', '${item.id}', loadStds)" class="text-red-500 hover:underline">删除</button>
            </td>
        </tr>`).join('') : '<tr><td colspan="6" class="text-center py-4 text-gray-400 text-sm">暂无数据</td></tr>';
};

// =================== 5. 操作动作 (删除/编辑/撤销) ===================

window.delItem = async (table, id, reloadFn) => {
    if(!confirm("确定要删除这条记录吗？此操作不可恢复。")) return;
    try { await deleteItem(table, id); reloadFn(); } catch(e) { alert("删除失败: " + e.message); }
};

window.editItem = async (prefix, id) => {
    document.getElementById(`${prefix}FormTitle`).innerText = "编辑模式";
    document.getElementById(`${prefix}CancelBtn`).classList.remove('hidden');
    document.getElementById(`${prefix}DraftTip`).classList.add('hidden'); 
    
    const map = { 'news': 'articles', 'act': 'activities', 'proj': 'projects', 'std': 'standards' };
    
    try {
        const data = await getItemById(map[prefix], id);
        if(!data) return alert("数据不存在");

        document.getElementById(`${prefix}Id`).value = data.id;

        if (prefix === 'news') {
            document.getElementById('newsTitle').value = data.title;
            document.getElementById('newsCategory').value = data.category;
            document.getElementById('newsSummary').value = data.summary || '';
            document.getElementById('newsSource').value = data.source || '';
            document.getElementById('newsAuthor').value = data.author || '';
            document.getElementById('newsPublishDate').value = data.publish_date || '';
            if (quillNews) quillNews.root.innerHTML = data.content || ''; 
        } 
        else if (prefix === 'act') {
            document.getElementById('actTitle').value = data.title;
            document.getElementById('actCategory').value = data.category || '';
            document.getElementById('actDate').value = data.date_range || '';
            document.getElementById('actLoc').value = data.location || '';
            document.getElementById('actSummary').value = data.summary || '';
            document.getElementById('actOrganizer').value = data.organizer || '';
            document.getElementById('actContractor').value = data.contractor || '';
            document.getElementById('actContact').value = data.contact || '';
            
            // 回显时间线
            renderTimelineToDOM(data.timeline || []);
            
            if (quillAct) quillAct.root.innerHTML = data.content || ''; 
        } 
        else if (prefix === 'proj') {
            document.getElementById('projName').value = data.name;
            document.getElementById('projType').value = data.type;
            document.getElementById('projStage').value = data.stage;
            document.getElementById('projRole').value = data.role || '';
            document.getElementById('projContent').value = data.content || '';
        } 
        else if (prefix === 'std') {
            document.getElementById('stdCode').value = data.code || '';
            document.getElementById('stdTitle').value = data.title || '';
            document.getElementById('stdType').value = data.type || '';
            document.getElementById('stdStatus').value = data.status || '';
            document.getElementById('stdPublishDate').value = data.publish_date || '';
            document.getElementById('stdImplementDate').value = data.implement_date || '';
            document.getElementById('stdDepartment').value = data.department || '';
            document.getElementById('stdDescription').value = data.description || '';
            document.getElementById('stdAllowDownload').checked = data.allow_download !== false;
        }

        document.getElementById(`${prefix}Form`).scrollIntoView({ behavior: 'smooth' });

    } catch (e) { alert("读取数据失败: " + e.message); }
};

window.cancelEdit = (prefix) => {
    document.getElementById(`${prefix}Form`).reset();
    document.getElementById(`${prefix}Id`).value = "";
    document.getElementById(`${prefix}CancelBtn`).classList.add('hidden');
    document.getElementById(`${prefix}FormTitle`).innerText = "新增";
    
    if (prefix === 'news' && quillNews) quillNews.setContents([]);
    if (prefix === 'act') {
        document.getElementById('timeline-container').innerHTML = ''; 
        if(quillAct) quillAct.setContents([]);
    }
    if (prefix === 'std') document.getElementById('stdAllowDownload').checked = true;

    restoreDraft(prefix);
};

// =================== 6. 辅助功能 (时间线 & 暂存) ===================

// [活动] 添加时间线行
window.addTimelineRow = (date = '', event = '') => {
    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center timeline-row mb-2';
    div.innerHTML = `
        <input type="text" placeholder="时间" class="border p-1.5 rounded text-sm w-1/3 outline-none focus:border-blue-500" value="${date}">
        <input type="text" placeholder="事件节点" class="border p-1.5 rounded text-sm flex-1 outline-none focus:border-blue-500" value="${event}">
        <button type="button" onclick="this.parentElement.remove()" class="text-red-500 px-2 hover:bg-red-50 rounded"><i class="fa-solid fa-trash"></i></button>
    `;
    document.getElementById('timeline-container').appendChild(div);
};

// [活动] 获取时间线数据 (返回数组)
function getTimelineFromDOM() {
    const rows = document.querySelectorAll('.timeline-row');
    const timeline = [];
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        if (inputs[0].value && inputs[1].value) {
            timeline.push({ date: inputs[0].value, event: inputs[1].value });
        }
    });
    return timeline;
}

// [活动] 渲染时间线
function renderTimelineToDOM(timelineData) {
    const container = document.getElementById('timeline-container');
    if (!container) return;
    container.innerHTML = ''; 
    if (Array.isArray(timelineData)) {
        timelineData.forEach(item => window.addTimelineRow(item.date, item.event));
    }
}

// [通用] 自动暂存
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

// [通用] 恢复暂存
function restoreDraft(prefix) {
    const raw = localStorage.getItem(`draft_${prefix}`);
    if (!raw || document.getElementById(`${prefix}Id`).value) return;
    
    try {
        const data = JSON.parse(raw);
        Object.keys(data).forEach(key => { 
            const el = document.getElementById(key); 
            if(el && key !== 'content') el.value = data[key]; 
        });
        
        if (prefix === 'news' && data.content && quillNews) quillNews.root.innerHTML = data.content;
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