const API_BASE = '/api'

async function request(url, options = {}) {
  const res = await fetch(API_BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json()
  if (!data.success) {
    throw new Error(data.message || '请求失败')
  }
  return data
}

export const api = {
  // 获取所有集合
  getCollections() {
    return request('/collections')
  },

  // 获取集合数据（分页）
  getCollectionData(name, page = 1, limit = 100) {
    return request(`/collections/${encodeURIComponent(name)}/data?page=${page}&limit=${limit}`)
  },

  // 获取集合全部数据
  getCollectionAll(name) {
    return request(`/collections/${encodeURIComponent(name)}/all`)
  },

  // 获取集合表头
  getCollectionHeaders(name) {
    return request(`/collections/${encodeURIComponent(name)}/headers`)
  },

  // 复制集合
  copyCollection(name, newName) {
    return request(`/collections/${encodeURIComponent(name)}/copy`, {
      method: 'POST',
      body: JSON.stringify({ newName }),
    })
  },

  // 保存数据到集合
  saveCollection(name, data) {
    return request(`/collections/${encodeURIComponent(name)}/save`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    })
  },
}
