// 文件路径：js/api.js

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ⚠️ 请替换为您自己的 Supabase 配置
const supabaseUrl = 'https://ncvcjlyzbuhzaoruwjba.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jdmNqbHl6YnVoemFvcnV3amJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNDIxNzgsImV4cCI6MjA4MDcxODE3OH0.yn7gsprnzMbK50kaYTwCOu5cgvJtXIKKMvJOIMQGLAA'

let supabaseInstance = null;

try {
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase 配置缺失");
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
    console.log("✅ [API] Supabase 连接成功");
} catch (e) {
    console.error("❌ [API] Supabase 初始化失败:", e);
}

export const supabase = supabaseInstance;

// ================= 1. 身份认证 (Auth) =================

export async function login(email, password) {
    if (!supabase) throw new Error("系统未初始化");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
}

export async function checkSession() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// ================= 2. 文件上传 (Storage) =================

export async function uploadImage(file) {
    if (!supabase) throw new Error("数据库未连接");
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
    
    const { error } = await supabase.storage.from('news-images').upload(fileName, file);
    if (error) throw error;

    const { data } = supabase.storage.from('news-images').getPublicUrl(fileName);
    return data.publicUrl;
}

// ================= 3. 通用 CRUD (数据库操作) =================

// [Create] 新增数据
export async function addItem(table, data) {
    if (!supabase) throw new Error("数据库未连接");
    const { error } = await supabase.from(table).insert([{ ...data, created_at: new Date() }]);
    if (error) throw error;
}

// [Delete] 删除数据
export async function deleteItem(table, id) {
    if (!supabase) throw new Error("数据库未连接");
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
}

// [Update] 修改数据
export async function updateItem(table, id, data) {
    if (!supabase) throw new Error("数据库未连接");
    const { error } = await supabase.from(table).update(data).eq('id', id);
    if (error) throw error;
}

// [Read - Single] 获取单条详情
export async function getItemById(table, id) {
    if (!supabase) return null;
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
}

// [Read - List] 获取列表 (支持搜索)
export async function getList(table, keyword = '', searchFields = ['title']) {
    if (!supabase) return [];

    let query = supabase.from(table).select('*').order('created_at', { ascending: false });

    // 构建模糊查询
    if (keyword && keyword.trim() !== '') {
        const orString = searchFields.map(field => `${field}.ilike.%${keyword}%`).join(',');
        query = query.or(orString);
    }

    const { data, error } = await query;
    if (error) {
        console.error(`获取 ${table} 列表失败:`, error.message);
        throw error;
    }
    return data;
}

// ================= 4. 专用获取函数 =================

// [新闻/公告] 获取文章列表
export async function getArticles(limit = 10, category = '') {
    if (!supabase) return [];
    
    let query = supabase.from('articles').select('*')
        .order('created_at', { ascending: false });
    
    if (category) {
        query = query.eq('category', category);
    }
    
    if (limit) {
        query = query.limit(limit);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// [新闻] 获取单篇文章并增加浏览量
export async function getArticleById(id) {
    if (!supabase) return null;
    
    // 先获取文章
    const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', id)
        .single();
    
    if (error) throw error;
    return data;
}

// [新闻] 增加浏览量（静默执行，不等待结果）
export async function incrementViews(id) {
    if (!supabase) return;
    
    // 异步执行，不阻塞页面
    supabase.rpc('increment_views', { article_id: id })
        .catch(err => console.warn('更新浏览量失败:', err));
}