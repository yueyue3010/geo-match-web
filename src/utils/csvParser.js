import Papa from 'papaparse'

export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = e.target.result
        const text = decodeCSV(buffer)
        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
        })
        if (result.errors && result.errors.length > 0) {
          console.warn('CSV解析警告:', result.errors)
        }
        if (!result.data || result.data.length === 0) {
          reject(new Error('CSV文件内容为空或格式不正确'))
          return
        }
        resolve(result.data)
      } catch (err) {
        console.error('CSV解析失败:', err)
        reject(new Error('CSV文件解析失败：' + err.message))
      }
    }
    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }
    reader.readAsArrayBuffer(file)
  })
}

function decodeCSV(buffer) {
  const bytes = new Uint8Array(buffer)
  const encoding = detectEncoding(bytes)
  
  if (encoding === 'utf8') {
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(buffer)
  }
  
  try {
    return decodeGBK(bytes)
  } catch (e) {
    console.warn('GBK解码失败，尝试UTF-8:', e)
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(buffer)
  }
}

function detectEncoding(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return 'utf8'
  }
  let hasHighByte = false
  for (let i = 0; i < Math.min(bytes.length, 1000); i++) {
    if (bytes[i] > 127) {
      hasHighByte = true
      break
    }
  }
  if (!hasHighByte) return 'utf8'
  return 'gbk'
}

function decodeGBK(bytes) {
  let str = ''
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i])
  }
  try {
    return decodeURIComponent(escape(str))
  } catch (e) {
    throw new Error('GBK编码解码失败，请确认文件编码')
  }
}

export function exportToCsv(data, filename) {
  const csv = Papa.unparse(data)
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ================== 坐标列自动检测 ==================
const LNG_CANDIDATES = ['lng_bd', 'lng_gd', 'lng', 'longitude', '经度', 'gaode_lng', 'bd_lng', 'WGS84_LNG', 'lon', '经度值', 'x坐标', 'x']
const LAT_CANDIDATES = ['lat_bd', 'lat_gd', 'lat', 'latitude', '纬度', 'gaode_lat', 'bd_lat', 'WGS84_LAT', '纬度值', 'y坐标', 'y']
const POINT_CANDIDATES = ['point', 'geometry', '坐标', '中心点', 'location', '经纬度', '经纬度坐标']

/**
 * 在表头数组中查找匹配的列名（忽略大小写、空格、中英括号）
 */
function findMatchedColumn(headers, candidates) {
  const normalizedHeaders = headers.map(h => String(h || '').trim().toLowerCase().replace(/[()（）\s]/g, ''))
  for (const cand of candidates) {
    const nCand = String(cand).trim().toLowerCase().replace(/[()（）\s]/g, '')
    const idx = normalizedHeaders.findIndex(h => h === nCand || h.includes(nCand) || nCand.includes(h))
    if (idx >= 0) return headers[idx]
  }
  return null
}

/**
 * 判断一个值是不是有效数字
 */
function isNumericVal(v) {
  if (v == null) return false
  const s = String(v).trim()
  if (!s) return false
  const n = parseFloat(s)
  return Number.isFinite(n)
}

/**
 * 判断数据是否具有有效坐标列
 * 规则：
 *   - 先尝试在表头中找 lng/lat 或 point 列
 *   - 若找到 lng/lat 列：在前 N 行中抽样，要求至少一定比例的行是有效数字，且数值在经纬度合理范围
 *   - 若找到 point 列：抽样检查能解析出坐标（POINT(..) / 逗号分隔 / 空格分隔）
 * @param {string[]} headers - 表头列
 * @param {Object[]} rows - 数据行
 * @returns {{ hasCoordinates: boolean, lngField?: string, latField?: string, pointField?: string }}
 */
export function detectHasCoordinates(headers, rows) {
  const result = { hasCoordinates: false, lngField: null, latField: null, pointField: null }
  if (!headers || !rows || headers.length === 0 || rows.length === 0) return result

  const lngCol = findMatchedColumn(headers, LNG_CANDIDATES)
  const latCol = findMatchedColumn(headers, LAT_CANDIDATES)
  const pointCol = findMatchedColumn(headers, POINT_CANDIDATES)

  const sampleSize = Math.min(rows.length, 30)
  const sampleRows = rows.slice(0, sampleSize)

  // 1. 检查 lng/lat 列
  if (lngCol && latCol) {
    let validCount = 0
    for (const row of sampleRows) {
      const rawLng = row[lngCol]
      const rawLat = row[latCol]
      if (!isNumericVal(rawLng) || !isNumericVal(rawLat)) continue
      const lng = parseFloat(rawLng)
      const lat = parseFloat(rawLat)
      const isLon = x => 73 <= x && x <= 135
      const isLat = y => 3 <= y && y <= 53
      // 允许 lon/lat 互换
      const valid = (isLon(lng) && isLat(lat)) || (isLon(lat) && isLat(lng))
      if (valid) validCount++
    }
    // 至少 30% 样本有效，或者至少 2 条记录有效
    const threshold = Math.max(2, Math.floor(sampleSize * 0.3))
    if (validCount >= threshold) {
      result.hasCoordinates = true
      result.lngField = lngCol
      result.latField = latCol
      return result
    }
  }

  // 2. 检查 point 列（WKT / 逗号分隔 / 空格分隔）
  if (pointCol) {
    let validCount = 0
    for (const row of sampleRows) {
      const raw = String(row[pointCol] || '').trim()
      if (!raw) continue
      const m1 = raw.match(/POINT\s*\(([^)]+)\)/i)
      const pool = m1 ? m1[1] : raw
      const nums = pool.match(/-?\d+\.?\d*/g)
      const filtered = nums ? nums.filter(n => n !== '' && n !== '.').map(Number) : []
      if (filtered.length >= 2) {
        const [a, b] = filtered
        if (Number.isFinite(a) && Number.isFinite(b)) {
          const isLon = x => 73 <= x && x <= 135
          const isLat = y => 3 <= y && y <= 53
          if ((isLon(a) && isLat(b)) || (isLon(b) && isLat(a)) || (a >= -180 && a <= 180 && b >= -90 && b <= 90)) {
            validCount++
          }
        }
      }
    }
    const threshold = Math.max(2, Math.floor(sampleSize * 0.3))
    if (validCount >= threshold) {
      result.hasCoordinates = true
      result.pointField = pointCol
      return result
    }
  }

  // 3. 兜底：扫描所有列，看是否存在两列是经纬度格式数字
  const numericCols = headers.map(() => 0)
  for (const row of sampleRows) {
    headers.forEach((h, i) => {
      const v = row[h]
      if (isNumericVal(v)) {
        const n = parseFloat(v)
        if (n >= -180 && n <= 180) numericCols[i]++
      }
    })
  }
  const validCols = []
  const threshold = Math.max(2, Math.floor(sampleSize * 0.5))
  numericCols.forEach((cnt, i) => {
    if (cnt >= threshold) validCols.push(headers[i])
  })
  if (validCols.length >= 2) {
    // 尝试判断哪一列是经度（范围更大接近 73-135）
    let lngGuess = null, latGuess = null
    for (const col of validCols) {
      const vals = sampleRows.map(r => parseFloat(r[col])).filter(n => Number.isFinite(n))
      if (vals.length === 0) continue
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      if (avg >= 73 && avg <= 135 && !lngGuess) lngGuess = col
      else if (avg >= 3 && avg <= 53 && !latGuess) latGuess = col
    }
    if (lngGuess && latGuess) {
      result.hasCoordinates = true
      result.lngField = lngGuess
      result.latField = latGuess
    }
  }

  return result
}

/**
 * 在表头中找名称列候选（用于默认选中）
 */
export function suggestNameColumn(headers) {
  const cands = ['小区名称', '名称', 'name', 'communityN', '小区名', '联城小区名称', '点位名称', '项目名称']
  return findMatchedColumn(headers, cands) || headers[0] || ''
}

/**
 * 在表头中找地址列候选（用于默认选中）
 */
export function suggestAddrColumn(headers) {
  const cands = ['地址', 'addr', 'address', 'community1', '小区地址', '联城小区地址', '详细地址', '位置']
  return findMatchedColumn(headers, cands) || headers[1] || ''
}

/**
 * 在表头中找 uv 列候选
 */
export function suggestUvColumn(headers) {
  const cands = ['uv_communi', 'uv_community_id', '小区唯一标识', '唯一编码', 'id']
  return findMatchedColumn(headers, cands) || ''
}
