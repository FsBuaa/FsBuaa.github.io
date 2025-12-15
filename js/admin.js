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

// 1.4 注册 Quill 格式 (字体/字号) - WPS 风格核心
const registerQuillFormats = () => {
    const Font = Quill.import('formats/font');
    // 定义字体白名单 (对应 CSS font-family)
    Font.whitelist = ['microsoft-yahei', 'simsun', 'simhei', 'kaiti', 'fangsong', 'arial', 'sans-serif'];
    Quill.register(Font, true);

    const Size = Quill.import('attributors/style/size');
    // 定义字号白名单
    Size.whitelist = ['12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px'];
    Quill.register(Size, true);
};

// =================== 2. 核心逻辑初始化 ===================
async function initAdmin() {
    registerQuillFormats(); // 调用注册

    // 公共的 WPS 风格工具栏配置
    const wpsToolbarModules = {
        toolbar: [
            // 字体与字号
            [{ 'font': ['microsoft-yahei', 'simsun', 'simhei', 'kaiti', 'fangsong', 'arial'] }],
            [{ 'size': ['12px', '14px', '16px', '18px', '20px', '24px', '30px'] }],
            
            // 文本样式
            ['bold', 'italic', 'underline', 'strike'],        
            [{ 'color': [] }, { 'background': [] }],          
            
            // 对齐与缩进
            [{ 'align': [] }],                                
            [{ 'indent': '-1'}, { 'indent': '+1' }],          
            
            // 标题与列表
            [{ 'header': [1, 2, 3, false] }],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],     
            
            // 插入与清除
            ['blockquote', 'code-block'],
            ['link', 'image', 'video'], 
            ['clean']                                         
        ]
    };

    // 2.1 初始化新闻编辑器 (升级为 WPS 增强版)
    if (document.getElementById('editor-container')) {
        quillNews = new Quill('#editor-container', {
            theme: 'snow',
            placeholder: '输入新闻正文 (支持从 Word/WPS/微信公众号 直接粘贴)...',
            modules: wpsToolbarModules // 使用相同的增强配置
        });
    }

    // 2.2 初始化活动详情编辑器 (WPS 增强版)
    if (document.getElementById('act-editor-container')) {
        quillAct = new Quill('#act-editor-container', {
            theme: 'snow',
            placeholder: '请在此输入内容，支持从 Word/WPS/微信公众号 直接粘贴...',
            modules: wpsToolbarModules
        });
    }

    // 2.3 加载所有列表数据
    loadNews();
    loadActs();
    loadProjs();
    loadStds();

    // 2.4 配置自动保存
    initAutoSave('news', ['newsTitle', 'newsCategory', 'newsSource', 'newsAuthor', 'newsPublishDate', 'newsSummary', 'newsCoverUrl'], 
        () => quillNews ? quillNews.root.innerHTML : '');
    
    initAutoSave('act', ['actTitle', 'actCategory', 'actDate', 'actLoc', 'actSummary', 'actOrganizer', 'actContractor', 'actContact', 'actImgUrl', 'actFileUrl'], 
        () => quillAct ? quillAct.root.innerHTML : '');
    
    initAutoSave('proj', ['projName', 'projType', 'projStage', 'projRole', 'projContent']);
    
    initAutoSave('std', ['stdCode', 'stdTitle', 'stdType', 'stdStatus', 'stdPublishDate', 'stdImplementDate', 'stdDepartment', 'stdDescription', 'stdPdfUrl']);

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

// =================== 3. 表单数据获取 (支持 URL 优先) ===================

// [新闻数据]
const getNewsData = async () => {
    // 逻辑：优先取 URL 输入框的值。如果为空，再看是否有文件上传。
    const manualUrl = document.getElementById('newsCoverUrl').value.trim();
    const file = document.getElementById('newsCover').files[0];
    
    let finalImageUrl = manualUrl;
    if (!finalImageUrl && file) {
        finalImageUrl = await uploadImage(file);
    }

    return {
        title: document.getElementById('newsTitle').value,
        category: document.getElementById('newsCategory').value,
        source: document.getElementById('newsSource').value,
        author: document.getElementById('newsAuthor').value,
        publish_date: document.getElementById('newsPublishDate').value,
        summary: document.getElementById('newsSummary').value,
        content: quillNews ? quillNews.root.innerHTML : '',
        // 仅当有最终 URL 时更新
        ...(finalImageUrl && { image_url: finalImageUrl }) 
    };
};

// [活动数据]
const getActData = async () => {
    const submitBtn = document.querySelector('#actForm button[type="submit"]');
    const originalText = submitBtn.innerText;

    // --- 图片处理逻辑 ---
    const imgUrlInput = document.getElementById('actImgUrl').value.trim();
    const imgFile = document.getElementById('actImg').files[0];
    let finalImgUrl = imgUrlInput;

    if (!finalImgUrl && imgFile) {
        try {
            submitBtn.innerText = "上传图片中...";
            finalImgUrl = await uploadFile(imgFile, 'news-images');
        } catch (e) {
            alert("封面图上传失败: " + e.message);
            submitBtn.innerText = originalText;
            throw e; 
        }
    }

    // --- 附件处理逻辑 ---
    const fileUrlInput = document.getElementById('actFileUrl').value.trim();
    const docFile = document.getElementById('actFile').files[0];
    let finalAttachUrl = fileUrlInput;

    if (!finalAttachUrl && docFile) {
        try {
            submitBtn.innerText = "上传附件中...";
            finalAttachUrl = await uploadFile(docFile, 'activity-files');
        } catch (e) {
            alert("附件上传失败 (请检查 activity-files 存储桶权限): " + e.message);
            submitBtn.innerText = originalText;
            throw e;
        }
    }

    submitBtn.innerText = originalText;

    // 构建数据对象
    return {
        title: document.getElementById('actTitle').value,
        category: document.getElementById('actCategory').value,
        date_range: document.getElementById('actDate').value,
        location: document.getElementById('actLoc').value,
        summary: document.getElementById('actSummary').value,
        organizer: document.getElementById('actOrganizer').value || '国家市场监督管理总局技术创新中心',
        contractor: document.getElementById('actContractor').value || '中国汽车工程研究院股份有限公司',
        contact: document.getElementById('actContact').value,
        
        timeline: getTimelineFromDOM(), 
        content: quillAct ? quillAct.root.innerHTML : '',
        
        ...(finalImgUrl && { image_url: finalImgUrl }),
        ...(finalAttachUrl && { attachment_url: finalAttachUrl })   
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
    const manualUrl = document.getElementById('stdPdfUrl').value.trim();
    const file = document.getElementById('stdPdf').files[0];
    const noUpload = document.getElementById('noPdfUpload').checked;

    let finalPdfUrl = manualUrl;
    
    // 如果没有手动 URL 且 未勾选“不上传” 且 有文件
    if (!finalPdfUrl && !noUpload && file) {
        finalPdfUrl = await uploadImage(file); 
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
        allow_download: document.getElementById('stdAllowDownload').checked,
        ...(finalPdfUrl && { pdf_url: finalPdfUrl })
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
            reloadFn(); 

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
            
            // --- 新闻图片回显 ---
            document.getElementById('newsCoverUrl').value = data.image_url || '';
            if (data.image_url) {
                document.getElementById('newsCoverPreviewBox').classList.remove('hidden');
                document.getElementById('newsCoverPreview').src = data.image_url;
                document.getElementById('newsCoverLink').href = data.image_url;
            } else {
                document.getElementById('newsCoverPreviewBox').classList.add('hidden');
            }
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
            
            // --- 活动图片回显 ---
            document.getElementById('actImgUrl').value = data.image_url || '';
            if (data.image_url) {
                document.getElementById('actImgPreviewBox').classList.remove('hidden');
                document.getElementById('actImgPreview').src = data.image_url;
            } else {
                document.getElementById('actImgPreviewBox').classList.add('hidden');
            }

            // --- 活动附件回显 ---
            document.getElementById('actFileUrl').value = data.attachment_url || '';
            if (data.attachment_url) {
                const link = document.getElementById('actFilePreviewLink');
                link.href = data.attachment_url;
                link.classList.remove('hidden');
                link.innerText = ' 下载现有附件';
            } else {
                document.getElementById('actFilePreviewLink').classList.add('hidden');
            }
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
            
            // --- 标准 PDF 回显 ---
            document.getElementById('stdPdfUrl').value = data.pdf_url || '';
            if (data.pdf_url) {
                const link = document.getElementById('stdPdfPreviewLink');
                link.href = data.pdf_url;
                link.classList.remove('hidden');
            } else {
                document.getElementById('stdPdfPreviewLink').classList.add('hidden');
            }
        }

        document.getElementById(`${prefix}Form`).scrollIntoView({ behavior: 'smooth' });

    } catch (e) { alert("读取数据失败: " + e.message); }
};

window.cancelEdit = (prefix) => {
    document.getElementById(`${prefix}Form`).reset();
    document.getElementById(`${prefix}Id`).value = "";
    document.getElementById(`${prefix}CancelBtn`).classList.add('hidden');
    document.getElementById(`${prefix}FormTitle`).innerText = "新增";
    
    // 清理预览
    if (prefix === 'news') {
        if (quillNews) quillNews.setContents([]);
        document.getElementById('newsCoverPreviewBox').classList.add('hidden');
        document.getElementById('newsCoverPreview').src = "";
    }
    if (prefix === 'act') {
        document.getElementById('timeline-container').innerHTML = ''; 
        if(quillAct) quillAct.setContents([]);
        document.getElementById('actImgPreviewBox').classList.add('hidden');
        document.getElementById('actImgPreview').src = "";
        document.getElementById('actFilePreviewLink').classList.add('hidden');
    }
    if (prefix === 'std') {
        document.getElementById('stdAllowDownload').checked = true;
        document.getElementById('stdPdfPreviewLink').classList.add('hidden');
    }

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

// =================== 7. 图片排版辅助 (支持新闻和活动) ===================
// 一键统一图片尺寸功能
window.formatContentImages = (type) => {
    let editor = null;
    if (type === 'news') editor = quillNews;
    else if (type === 'act') editor = quillAct;

    if (!editor) return alert("编辑器未初始化");

    const editorRoot = editor.root;
    const images = editorRoot.querySelectorAll('img');

    if (images.length === 0) {
        return alert("正文中没有检测到图片");
    }

    let count = 0;
    images.forEach(img => {
        // 设置样式：宽度100%，高度自动，居中显示
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '10px auto'; 
        img.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)'; 
        img.removeAttribute('width'); 
        img.removeAttribute('height');
        count++;
    });

    // 强制触发更新，确保 changes 被记录
    editor.update(); 
    
    alert(`已自动调整 ${count} 张图片的尺寸为 100% 宽度适配。`);
};

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