import { haversineDistance, levenshteinSimilarity } from './geoUtils'

// ===================== 可调参数 =====================
export const DEFAULT_NAME_THRESH = 60
export const DEFAULT_ADDR_THRESH = 60
export const DEFAULT_DIST_LIMIT = 300
const ROAD_SIM_THRESH = 85
const ORDER_THRESH = 0.85

// ================= 1. 上海市行政区划数据 =================
const countyToTowns = {
  '黄浦区': ['南京东路街道','外滩街道','半淞园路街道','小东门街道','豫园街道','老西门街道','五里桥街道','打浦桥街道','淮海中路街道','瑞金二路街道'],
  '徐汇区': ['天平路街道','湖南路街道','斜土路街道','枫林路街道','长桥街道','田林街道','虹梅路街道','康健新村街道','凌云路街道','龙华街道','漕河泾街道','华泾镇','漕河泾新兴技术开发区'],
  '长宁区': ['华阳路街道','江苏路街道','新华路街道','周家桥街道','天山路街道','仙霞新村街道','虹桥街道','程家桥街道','北新泾街道','新泾镇'],
  '静安区': ['江宁路街道','石门二路街道','南京西路街道','静安寺街道','曹家渡街道','天目西路街道','北站街道','宝山路街道','共和新路街道','大宁路街道','彭浦新村街道','临汾路街道','芷江西路街道','彭浦镇'],
  '普陀区': ['曹杨新村街道','长风新村街道','长寿路街道','甘泉路街道','石泉路街道','宜川路街道','万里街道','真如镇街道','长征镇','桃浦镇'],
  '虹口区': ['欧阳路街道','曲阳路街道','广中路街道','嘉兴路街道','凉城新村街道','四川北路街道','北外滩街道','江湾镇街道'],
  '杨浦区': ['定海路街道','平凉路街道','江浦路街道','四平路街道','控江路街道','长白新村街道','延吉新村街道','殷行街道','大桥街道','五角场街道','新江湾城街道','长海路街道'],
  '闵行区': ['江川路街道','古美街道','新虹街道','浦锦街道','莘庄镇','七宝镇','颛桥镇','华漕镇','虹桥镇','梅陇镇','吴泾镇','马桥镇','浦江镇','莘庄工业区'],
  '宝山区': ['友谊路街道','吴淞街道','张庙街道','罗店镇','大场镇','杨行镇','月浦镇','罗泾镇','顾村镇','高境镇','庙行镇','淞南镇','宝山工业园区'],
  '嘉定区': ['新成路街道','真新街道','嘉定镇街道','南翔镇','安亭镇','马陆镇','徐行镇','华亭镇','外冈镇','江桥镇','菊园新区','嘉定工业区'],
  '浦东新区': ['潍坊新村街道','陆家嘴街道','周家渡街道','塘桥街道','上钢新村街道','南码头路街道','沪东新村街道','金杨新村街道','洋泾街道','浦兴路街道','东明路街道','花木街道','川沙新镇','高桥镇','北蔡镇','合庆镇','唐镇','曹路镇','金桥镇','高行镇','高东镇','张江镇','三林镇','惠南镇','周浦镇','新场镇','大团镇','康桥镇','航头镇','祝桥镇','泥城镇','宣桥镇','书院镇','万祥镇','老港镇','南汇新城镇','芦潮港农场','东海农场','朝阳农场','中国（上海）自由贸易试验区（保税片区）','金桥经济技术开发区','张江高科技园区'],
  '金山区': ['石化街道','朱泾镇','枫泾镇','张堰镇','亭林镇','吕巷镇','廊下镇','金山卫镇','漕泾镇','山阳镇','上海湾区高新技术产业开发区'],
  '松江区': ['岳阳街道','永丰街道','方松街道','中山街道','广富林街道','九里亭街道','泗泾镇','佘山镇','车墩镇','新桥镇','洞泾镇','九亭镇','泖港镇','石湖荡镇','新浜镇','叶榭镇','小昆山镇','松江工业区','佘山度假区','上海松江出口加工区'],
  '青浦区': ['夏阳街道','盈浦街道','香花桥街道','朱家角镇','练塘镇','金泽镇','赵巷镇','徐泾镇','华新镇','重固镇','白鹤镇'],
  '奉贤区': ['西渡街道','奉浦街道','金海街道','南桥镇','奉城镇','庄行镇','金汇镇','四团镇','青村镇','柘林镇','海湾镇','海湾旅游区'],
  '崇明区': ['城桥镇','堡镇','新河镇','庙镇','竖新镇','向化镇','三星镇','港沿镇','中兴镇','陈家镇','绿华镇','港西镇','建设镇','新海镇','东平镇','长兴镇','新村乡','横沙乡','前卫农场','东平林场','上实现代农业园区'],
}

const townToCounty = {}
for (const county of Object.keys(countyToTowns)) {
  for (const town of countyToTowns[county]) {
    townToCounty[town] = county
  }
}

const allTownsSorted = Object.keys(townToCounty).sort((a, b) => b.length - a.length)
const allCountiesSorted = Object.keys(countyToTowns).sort((a, b) => b.length - a.length)

const COUNTY_SHORT_MAP = {}
for (const c of Object.keys(countyToTowns)) {
  if (c === '浦东新区') COUNTY_SHORT_MAP[c] = '浦东'
  else if (c.endsWith('区')) COUNTY_SHORT_MAP[c] = c.slice(0, -1)
  else COUNTY_SHORT_MAP[c] = c
}

const REGION_SHORT_TO_FULL = {
  '黄浦':'黄浦区','徐汇':'徐汇区','长宁':'长宁区','静安':'静安区',
  '普陀':'普陀区','虹口':'虹口区','杨浦':'杨浦区','闵行':'闵行区',
  '宝山':'宝山区','嘉定':'嘉定区','浦东':'浦东新区','金山':'金山区',
  '松江':'松江区','青浦':'青浦区','奉贤':'奉贤区','崇明':'崇明区',
}

// ================= 2. 工具函数 =================
function removeAllSpace(s) {
  if (s == null) return ''
  return String(s).replace(/\s+/g, '')
}

function fuzzRatio(s1, s2) {
  if (!s1 || !s2) return 0
  return Math.round(levenshteinSimilarity(s1, s2) * 100)
}

export function splitShanghaiAddress(address) {
  address = removeAllSpace(address)
  if (!address) return { province: '', district: '', town: '', detail: '' }
  let addr = address
  const result = { province: '', district: '', town: '', detail: '' }

  if (addr.startsWith('上海市')) {
    result.province = '上海市'
    addr = addr.slice(3)
  } else if (addr.startsWith('上海')) {
    result.province = '上海市'
    addr = addr.slice(2)
  }

  let matchedDistrict = null
  let matchedLen = 0

  for (const district of allCountiesSorted) {
    if (addr.startsWith(district)) {
      matchedDistrict = district
      matchedLen = district.length
      break
    }
    const shortName = COUNTY_SHORT_MAP[district]
    if (shortName && addr.startsWith(shortName)) {
      const remainder = addr.slice(shortName.length)
      if (!remainder || !'路街镇村新地'.includes(remainder[0])) {
        matchedDistrict = district
        matchedLen = shortName.length
        break
      }
    }
  }

  if (matchedDistrict) {
    result.district = matchedDistrict
    addr = addr.slice(matchedLen)
  } else {
    const m = addr.match(/^([\u4e00-\u9fff]+区)/)
    if (m) {
      result.district = m[1]
      addr = addr.slice(m[1].length)
    }
  }

  let matchedTown = null
  for (const town of allTownsSorted) {
    if (addr.startsWith(town)) {
      matchedTown = town
      break
    }
  }
  if (matchedTown) {
    result.town = matchedTown
    addr = addr.slice(matchedTown.length)
  } else {
    const suffixes = ['街道','镇','乡','新区','工业区','开发区']
    for (const suffix of suffixes) {
      const pattern = new RegExp(`^([\\u4e00-\\u9fff（）()]+${suffix})`)
      const m = pattern.exec(addr)
      if (m) {
        result.town = m[1]
        addr = addr.slice(m[1].length)
        break
      }
    }
  }

  result.detail = addr.trim()
  return result
}

// ================= 3. 详细地址结构化解析 =================
const LANE_SUFFIX = '(?:弄|支弄|坊|村|邨|庄园|花园|公寓|大厦|小区|家园|苑|里|街|巷)'
const NUM_SUFFIX = '(?:号|号楼|座|栋|幢)'
const ROOM_SUFFIX = '(?:室|号室|楼|层|F)'
const SUB_SUFFIX = '(?:甲|乙|丙|丁|之[一二三四五六七八九十])?'
const ADDR_SEP = /[,，、；;]/
const RANGE_PAT_FULL = new RegExp(`(\\d+)\\s*(${NUM_SUFFIX}|${LANE_SUFFIX})\\s*[-—~～]\\s*(\\d+)\\s*(${NUM_SUFFIX}|${LANE_SUFFIX})`)
const RANGE_PAT_SHORT = new RegExp(`(\\d+)\\s*[-—~～]\\s*(\\d+)\\s*(${NUM_SUFFIX}|${LANE_SUFFIX})`)

function _extractNumsFromSingle(s) {
  const pairs = []
  const processedSpans = []

  let m
  while ((m = RANGE_PAT_FULL.exec(s)) !== null) {
    const n1 = parseInt(m[1]), suf1 = m[2], n2 = parseInt(m[3]), suf2 = m[4]
    const ntype = new RegExp(`^${LANE_SUFFIX}`).test(suf2) ? 'lane' : 'num'
    if (n1 <= n2 && n2 - n1 <= 300) {
      for (let n = n1; n <= n2; n++) pairs.push([n, ntype])
    } else {
      pairs.push([n1, ntype], [n2, ntype])
    }
    processedSpans.push([m.index, m.index + m[0].length])
    s = s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length)
  }

  while ((m = RANGE_PAT_SHORT.exec(s)) !== null) {
    const start = m.index
    if (processedSpans.some(sp => sp[0] <= start && start < sp[1])) continue
    const n1 = parseInt(m[1]), n2 = parseInt(m[2]), suf = m[3]
    const ntype = new RegExp(`^${LANE_SUFFIX}`).test(suf) ? 'lane' : 'num'
    if (n1 <= n2 && n2 - n1 <= 300) {
      for (let n = n1; n <= n2; n++) pairs.push([n, ntype])
    } else {
      pairs.push([n1, ntype], [n2, ntype])
    }
    processedSpans.push([start, start + m[0].length])
    s = s.slice(0, start) + ' '.repeat(m[0].length) + s.slice(start + m[0].length)
  }

  function isProcessed(pos) {
    return processedSpans.some(sp => sp[0] <= pos && pos < sp[1])
  }

  const lanePat = new RegExp(`(\\d+)\\s*${LANE_SUFFIX}`, 'g')
  while ((m = lanePat.exec(s)) !== null) {
    if (!isProcessed(m.index)) pairs.push([parseInt(m[1]), 'lane'])
  }

  const numPat = new RegExp(`(\\d+)\\s*${NUM_SUFFIX}`, 'g')
  while ((m = numPat.exec(s)) !== null) {
    if (!isProcessed(m.index)) pairs.push([parseInt(m[1]), 'num'])
  }

  return pairs
}

function _extractRoadFromSingle(s) {
  let s2 = s.replace(RANGE_PAT_FULL, '').replace(RANGE_PAT_SHORT, '')
  s2 = s2.replace(new RegExp(`\\d+\\s*${LANE_SUFFIX}`, 'g'), '')
  s2 = s2.replace(new RegExp(`\\d+\\s*${NUM_SUFFIX}\\s*${SUB_SUFFIX}`, 'g'), '')
  s2 = s2.replace(new RegExp(`\\d+\\s*${ROOM_SUFFIX}\\s*$`, 'g'), '')
  s2 = s2.trim().replace(/[-—~～]$/, '')
  return s2.trim()
}

const _parseCache = new Map()

export function parseDetailAddress(detail) {
  detail = removeAllSpace(detail)
  if (!detail) {
    return { road: '', laneNo: null, numNo: null, laneSet: new Set(), numSet: new Set(), raw: '', numSub: '', roomNo: null }
  }

  const cacheKey = detail
  if (_parseCache.has(cacheKey)) return _parseCache.get(cacheKey)

  const s = detail
  const result = { raw: s, laneSet: new Set(), numSet: new Set() }

  const roomPat = new RegExp(`(\\d+)\\s*${ROOM_SUFFIX}\\s*$`)
  const mRoom = roomPat.exec(s)
  const sNoRoom = mRoom ? s.slice(0, s.length - mRoom[0].length).trim() : s

  const parts = sNoRoom.split(ADDR_SEP).map(p => p.trim()).filter(Boolean)
  const actualParts = parts.length > 0 ? parts : [sNoRoom]

  const roads = []
  let firstLane = null, firstNum = null, firstSub = ''

  for (const part of actualParts) {
    const pairs = _extractNumsFromSingle(part)
    const road = _extractRoadFromSingle(part)
    if (road) roads.push(road)
    for (const [n, ntype] of pairs) {
      if (ntype === 'lane') {
        result.laneSet.add(n)
        if (firstLane === null) firstLane = n
      } else {
        result.numSet.add(n)
        if (firstNum === null) firstNum = n
      }
    }
  }

  const numSubPat = new RegExp(`\\d+\\s*${NUM_SUFFIX}\\s*(${SUB_SUFFIX})`)
  const mSub = numSubPat.exec(sNoRoom)
  if (mSub) firstSub = mSub[1] || ''

  result.road = roads.reduce((a, b) => a.length >= b.length ? a : b, '')
  result.laneNo = firstLane
  result.numNo = firstNum
  result.numSub = firstSub
  result.laneSuffix = ''
  result.numSuffix = ''
  result.roomNo = mRoom ? mRoom[1] : null

  _parseCache.set(cacheKey, result)
  return result
}

// ================= 4. 冲突检测 =================
export function checkLaneNumConflict(parsed1, parsed2) {
  const ls1 = parsed1.laneSet || new Set()
  const ns1 = parsed1.numSet || new Set()
  const ls2 = parsed2.laneSet || new Set()
  const ns2 = parsed2.numSet || new Set()

  const onlyLane1 = ls1.size > 0 && ns1.size === 0
  const onlyNum1 = ns1.size > 0 && ls1.size === 0
  const onlyLane2 = ls2.size > 0 && ns2.size === 0
  const onlyNum2 = ns2.size > 0 && ls2.size === 0

  if ((onlyLane1 && onlyNum2) || (onlyNum1 && onlyLane2)) {
    return [true, '硬冲突：门牌类型不一致，一方【弄】一方【号】禁止匹配']
  }
  return [false, '']
}

export function addressHasHardConflict(parsed1, parsed2) {
  const ls1 = parsed1.laneSet || new Set()
  const ns1 = parsed1.numSet || new Set()
  const ls2 = parsed2.laneSet || new Set()
  const ns2 = parsed2.numSet || new Set()

  const road1 = (parsed1.road || '').trim()
  const road2 = (parsed2.road || '').trim()
  let roadSame = false
  if (road1 && road2 && fuzzRatio(road1, road2) >= ROAD_SIM_THRESH) {
    roadSame = true
  }

  const [conflict, msg] = checkLaneNumConflict(parsed1, parsed2)
  if (conflict) return [true, msg]

  if (ns1.size > 0 && ns2.size > 0) {
    const intersection = new Set([...ns1].filter(x => ns2.has(x)))
    if (intersection.size === 0) return [true, `号冲突:${setToStr(ns1)}vs${setToStr(ns2)}`]
  }

  if (ls1.size > 0 && ls2.size > 0) {
    const intersection = new Set([...ls1].filter(x => ls2.has(x)))
    if (intersection.size === 0) return [true, `弄冲突:${setToStr(ls1)}vs${setToStr(ls2)}`]
  }

  if (ns1.size > 0 && ns2.size > 0) {
    const sub1 = parsed1.numSub || ''
    const sub2 = parsed2.numSub || ''
    if (sub1 !== sub2 && eqSet(ns1, ns2)) {
      return [true, `号后缀冲突:'${sub1}'vs'${sub2}'`]
    }
  }

  if (roadSame) {
    const allNums1 = new Set([...ls1, ...ns1])
    const allNums2 = new Set([...ls2, ...ns2])
    if (allNums1.size > 0 && allNums2.size > 0) {
      const intersection = new Set([...allNums1].filter(x => allNums2.has(x)))
      if (intersection.size === 0) {
        return [true, `道路相同但门牌数字无交集: ${setToStr(allNums1)} vs ${setToStr(allNums2)}`]
      }
    }
  }

  return [false, null]
}

export function addressHasSoftConflict(parsed1, parsed2) {
  const ls1 = parsed1.laneSet || new Set()
  const ns1 = parsed1.numSet || new Set()
  const ls2 = parsed2.laneSet || new Set()
  const ns2 = parsed2.numSet || new Set()
  if (ls1.size > 0 && ns1.size === 0 && ns2.size > 0 && ls2.size === 0) {
    const intersection = new Set([...ls1].filter(x => ns2.has(x)))
    if (intersection.size === 0) return [true, `弄号集合无交集: ${setToStr(ls1)} vs ${setToStr(ns2)}`]
  }
  return [false, null]
}

export function addressElementScore(parsed1, parsed2) {
  let score = 0
  const ls1 = parsed1.laneSet || new Set()
  const ns1 = parsed1.numSet || new Set()
  const ls2 = parsed2.laneSet || new Set()
  const ns2 = parsed2.numSet || new Set()

  if (ls1.size > 0 && ls2.size > 0) {
    const intersection = new Set([...ls1].filter(x => ls2.has(x)))
    if (intersection.size > 0) score += 15
  }
  if (ns1.size > 0 && ns2.size > 0) {
    const intersection = new Set([...ns1].filter(x => ns2.has(x)))
    if (intersection.size > 0) score += 20
    const sub1 = parsed1.numSub || ''
    const sub2 = parsed2.numSub || ''
    if (sub1 === sub2 && sub1 !== '') score += 3
  }
  if (parsed1.roomNo && parsed2.roomNo && parsed1.roomNo === parsed2.roomNo) {
    score += 5
  }
  return score
}

function setToStr(s) {
  return `{${Array.from(s).join(',')}}`
}
function eqSet(a, b) {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

// ================= 5. 文本与距离计算 =================
function lcsOrderRatio(s1, s2) {
  s1 = String(s1).trim()
  s2 = String(s2).trim()
  if (!s1 || !s2) return 0.0
  const m = s1.length, n = s2.length
  let prev = new Array(n + 1).fill(0)
  let curr = new Array(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        curr[j] = prev[j - 1] + 1
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1])
      }
    }
    prev = [...curr]
    curr.fill(0)
  }
  return prev[n] / Math.min(m, n)
}

function splitText(text) {
  if (!text) return []
  return String(text).split(ADDR_SEP).map(p => p.trim()).filter(Boolean)
}

export function calcScore(tStr, sStr) {
  const tParts = splitText(tStr)
  const sParts = splitText(sStr)
  if (tParts.length === 0) tParts.push('')
  if (sParts.length === 0) sParts.push('')
  let bestScore = 0
  for (const tp of tParts) {
    for (const sp of sParts) {
      if (!tp || !sp) continue
      const base = fuzzRatio(tp, sp)
      const order = lcsOrderRatio(tp, sp)
      const score = order >= ORDER_THRESH ? base : Math.round(base * order * 10) / 10
      if (score > bestScore) bestScore = score
    }
  }
  return bestScore
}

export function calcAddrScoreImproved(targetDetail, sourceDetail) {
  const tParsed = parseDetailAddress(targetDetail)
  const sParsed = parseDetailAddress(sourceDetail)

  const [hasHardConflict, hardReason] = addressHasHardConflict(tParsed, sParsed)
  if (hasHardConflict) {
    return { score: 0.0, conflict: hardReason, isHard: true }
  }

  const [hasSoftConflict, softReason] = addressHasSoftConflict(tParsed, sParsed)

  const tRoadParts = tParsed.road ? splitText(tParsed.road) : splitText(targetDetail)
  const sRoadParts = sParsed.road ? splitText(sParsed.road) : splitText(sourceDetail)
  const actualTRoad = tRoadParts.length > 0 ? tRoadParts : [String(targetDetail).trim()]
  const actualSRoad = sRoadParts.length > 0 ? sRoadParts : [String(sourceDetail).trim()]

  let bestRoadScore = 0
  for (const tp of actualTRoad) {
    for (const sp of actualSRoad) {
      if (!tp || !sp) continue
      const base = fuzzRatio(tp, sp)
      const order = lcsOrderRatio(tp, sp)
      const score = order >= ORDER_THRESH ? base : Math.round(base * order * 10) / 10
      if (score > bestRoadScore) bestRoadScore = score
    }
  }

  if ((!tParsed.road || !sParsed.road)) {
    const fallback = calcScore(targetDetail, sourceDetail)
    bestRoadScore = Math.max(bestRoadScore, Math.round(fallback * 0.7 * 10) / 10)
  }

  const fuzzyPart = bestRoadScore * 0.6
  const elementPart = addressElementScore(tParsed, sParsed)
  let total = Math.round((fuzzyPart + elementPart) * 10) / 10
  let conflictMsg = null
  if (hasSoftConflict) {
    total = Math.round(total * 0.4 * 10) / 10
    conflictMsg = softReason
  }
  return { score: Math.min(total, 100), conflict: conflictMsg, isHard: false }
}

// ================= 6. 坐标解析 =================
export function parsePoint(pointStr) {
  if (pointStr == null) return null
  const raw = String(pointStr).trim()
  if (!raw || ['nan','none','null','无','空','na'].includes(raw.toLowerCase())) return null
  const m = raw.match(/POINT\s*\(([^)]+)\)/i)
  const pool = m ? m[1] : raw
  const nums = pool.match(/-?\d+\.?\d*/g)
  const filtered = nums ? nums.filter(n => n !== '' && n !== '.').map(Number) : []
  if (filtered.length < 2) return null
  const [a, b] = filtered
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const isLon = x => 73 <= x && x <= 135
  const isLat = y => 3 <= y && y <= 53
  if (isLon(a) && isLat(b)) return [a, b]
  if (isLat(a) && isLon(b)) return [b, a]
  return [a, b]
}

// ================= 7. 主匹配函数 =================
/**
 * 对单个目标点进行候选匹配
 * @param {Object} target - 目标点（待匹配点/源点）
 * @param {Array} sourcePoints - 源点数组（候选点库）
 * @param {Object} options - 配置参数
 * @returns {Array} 匹配结果数组，按得分排序
 */
export function findSmartCandidates(target, sourcePoints, options = {}) {
  const {
    nameThresh = DEFAULT_NAME_THRESH,
    addrThresh = DEFAULT_ADDR_THRESH,
    distLimit = DEFAULT_DIST_LIMIT,
    returnAll = false,
    regionFilter = true,
    getTargetNameField = () => 'communityN',
    getTargetAddrField = () => 'community1',
    getTargetPointField = () => 'point',
    getTargetRegionField = () => 'region',
    getSourceNameField = () => '联城小区名称',
    getSourceAddrField = () => '联城小区地址',
    getSourceRegionField = () => '联城区域',
    getSourceTownField = () => '联城街道',
    getSourcePointField = () => 'point',
    getSourceIdField = () => 'uv_community_id',
  } = options

  const targetName = target[getTargetNameField()]
  const targetAddr = target[getTargetAddrField()]
  const targetPoint = target[getTargetPointField()]
  const targetRegion = target[getTargetRegionField()]
  const targetLng = target[options.getTargetLngField ? options.getTargetLngField() : '']
  const targetLat = target[options.getTargetLatField ? options.getTargetLatField() : '']

  const tParsed = splitShanghaiAddress(targetAddr)
  let tDistrict = tParsed.district
  const tTown = tParsed.town
  const tDetail = tParsed.detail

  const targetAddrParsed = parseDetailAddress(targetAddr)
  const targetRoad = targetAddrParsed.road || ''

  if (!tDistrict && targetRegion != null) {
    const regionStr = String(targetRegion).trim()
    if (REGION_SHORT_TO_FULL[regionStr]) {
      tDistrict = REGION_SHORT_TO_FULL[regionStr]
    } else if (regionStr.endsWith('区') && countyToTowns[regionStr]) {
      tDistrict = regionStr
    }
  }

  // 按区+街道 或 区 分组源点
  const sourceList = sourcePoints.map((s, idx) => {
    let coords = parsePoint(s[getSourcePointField()])
    if (!coords) {
      // 尝试用单独的经纬度字段
      const sLng = s[options.getSourceLngField ? options.getSourceLngField() : '']
      const sLat = s[options.getSourceLatField ? options.getSourceLatField() : '']
      const lng = parseFloat(sLng)
      const lat = parseFloat(sLat)
      if (lng && lat) coords = [lng, lat]
    }
    return {
      source: s,
      idx,
      lon: coords ? coords[0] : null,
      lat: coords ? coords[1] : null,
      name: String(s[getSourceNameField()] || '').trim(),
      detail: removeAllSpace(String(s[getSourceAddrField()] || '')),
      id: s[getSourceIdField()],
    }
  }).filter(s => s.lon != null && s.lat != null)

  // 按行政区划预筛选（regionFilter=false 时不过滤）
  let candList = sourceList
  if (regionFilter) {
    if (tDistrict && tTown) {
      const townMatch = sourceList.filter(s => {
        const sRegion = String(s.source[getSourceRegionField()] || '').trim()
        const sTown = String(s.source[getSourceTownField()] || '').trim()
        if (!sRegion && !sTown) return true
        const fullRegion = REGION_SHORT_TO_FULL[sRegion] || sRegion
        return fullRegion === tDistrict && sTown === tTown
      })
      if (townMatch.length > 0) candList = townMatch
    } else if (tDistrict) {
      const districtMatch = sourceList.filter(s => {
        const sRegion = String(s.source[getSourceRegionField()] || '').trim()
        if (!sRegion) return true
        const fullRegion = REGION_SHORT_TO_FULL[sRegion] || sRegion
        return fullRegion === tDistrict
      })
      if (districtMatch.length > 0) candList = districtMatch
    }
  }

  let tCoords = parsePoint(targetPoint)
  if (!tCoords && targetLng && targetLat) {
    const lng = parseFloat(targetLng)
    const lat = parseFloat(targetLat)
    if (lng && lat) tCoords = [lng, lat]
  }
  let noDistanceFilter = false
  let withinCands = []

  if (tCoords == null) {
    noDistanceFilter = true
    withinCands = candList
  } else {
    const [tLon, tLat] = tCoords
    withinCands = candList.filter(c => {
      const dist = haversineDistance(tLon, tLat, c.lon, c.lat)
      c._dist = dist
      return dist <= distLimit
    })
    if (withinCands.length === 0) return []
  }

  const isNameEmpty = !targetName || String(targetName).trim() === ''
  const isAddrEmpty = !targetAddr || String(targetAddr).trim() === ''
  const tNameStr = isNameEmpty ? '' : String(targetName).trim()
  const tDetailStr = isAddrEmpty ? '' : String(tDetail).trim()

  const allMatches = []

  for (const c of withinCands) {
    const dist = noDistanceFilter ? 0.0 : c._dist

    if (noDistanceFilter && targetRoad && !c.detail.includes(targetRoad)) continue

    const srcAddrParsed = parseDetailAddress(c.detail)
    if (noDistanceFilter && targetRoad && srcAddrParsed.road) {
      if (fuzzRatio(targetRoad, srcAddrParsed.road) < 40) continue
    }

    const sName = isNameEmpty ? 0 : calcScore(tNameStr, c.name)

    let sAddr = 0, addrConflict = null, isHard = false
    if (isAddrEmpty) {
      sAddr = 0
    } else {
      const addrResult = calcAddrScoreImproved(tDetailStr, c.detail)
      sAddr = addrResult.score
      addrConflict = addrResult.conflict
      isHard = addrResult.isHard
      if (isHard) continue
    }

    const nameOk = !isNameEmpty && sName >= nameThresh
    const addrOk = !isAddrEmpty && sAddr >= addrThresh

    if (returnAll || nameOk || addrOk) {
      allMatches.push({
        sourceId: c.id,
        name: c.name,
        addr: c.detail,
        nameScore: sName,
        addrScore: sAddr,
        dist: Math.round(dist * 100) / 100,
        conflict: addrConflict,
        sourcePoint: c.source,
      })
    }
  }

  // 排序：先按冲突，再按 -(名称得分+地址得分)，最后按距离
  allMatches.sort((a, b) => {
    const conflictA = a.conflict ? 1 : 0
    const conflictB = b.conflict ? 1 : 0
    if (conflictA !== conflictB) return conflictA - conflictB
    const scoreA = -(a.nameScore + a.addrScore)
    const scoreB = -(b.nameScore + b.addrScore)
    if (scoreA !== scoreB) return scoreA - scoreB
    return a.dist - b.dist
  })

  return allMatches
}

/**
 * 批量匹配：对所有目标点进行匹配
 * @param {Array} targetPoints - 目标点数组
 * @param {Array} sourcePoints - 源点数组
 * @param {Object} options - 配置参数
 * @param {Function} [onProgress] - 进度回调 (current, total) => void
 * @returns {Array} 每个目标点的最佳匹配结果
 */
export function batchSmartMatch(targetPoints, sourcePoints, options = {}, onProgress = null) {
  const results = []
  const total = targetPoints.length
  for (let i = 0; i < total; i++) {
    const target = targetPoints[i]
    const candidates = findSmartCandidates(target, sourcePoints, options)
    if (candidates.length > 0) {
      const best = candidates[0]
      results.push({
        target,
        bestMatch: best,
        allCandidates: candidates,
        matched: true,
      })
    } else {
      results.push({
        target,
        bestMatch: null,
        allCandidates: [],
        matched: false,
      })
    }
    if (onProgress && (i % 5 === 0 || i === total - 1)) {
      onProgress(i + 1, total)
    }
  }
  return results
}

// ================= 8. 无坐标纯文本匹配（地址匹配模式） =================
/**
 * 纯文本匹配：仅基于名称和地址相似度，不计算经纬度距离
 * @param {Object} target - 待匹配点
 * @param {Array} sourcePoints - 候选点数组
 * @param {Object} options - 配置（含名称阈值、地址阈值）
 * @returns {Array} 匹配结果数组，按得分排序
 */
export function findAddressOnlyCandidates(target, sourcePoints, options = {}) {
  const {
    nameThresh = DEFAULT_NAME_THRESH,
    addrThresh = DEFAULT_ADDR_THRESH,
    returnAll = false,
    regionFilter = true,
    getTargetNameField = () => 'communityN',
    getTargetAddrField = () => 'community1',
    getTargetRegionField = () => 'region',
    getSourceNameField = () => '联城小区名称',
    getSourceAddrField = () => '联城小区地址',
    getSourceRegionField = () => '联城区域',
    getSourceTownField = () => '联城街道',
    getSourceIdField = () => 'uv_community_id',
    limit = 10,
  } = options

  const targetName = target[getTargetNameField()]
  const targetAddr = target[getTargetAddrField()]
  const targetRegion = target[getTargetRegionField()]

  const tParsed = splitShanghaiAddress(targetAddr)
  let tDistrict = tParsed.district
  const tTown = tParsed.town
  const tDetail = tParsed.detail

  const targetAddrParsed = parseDetailAddress(targetAddr)
  const targetRoad = targetAddrParsed.road || ''

  if (!tDistrict && targetRegion != null) {
    const regionStr = String(targetRegion).trim()
    if (REGION_SHORT_TO_FULL[regionStr]) {
      tDistrict = REGION_SHORT_TO_FULL[regionStr]
    } else if (regionStr.endsWith('区') && countyToTowns[regionStr]) {
      tDistrict = regionStr
    }
  }

  // 构建源点列表（不要求有坐标）
  const sourceList = sourcePoints.map((s, idx) => ({
    source: s,
    idx,
    name: String(s[getSourceNameField()] || '').trim(),
    detail: removeAllSpace(String(s[getSourceAddrField()] || '')),
    id: s[getSourceIdField()],
    region: String(s[getSourceRegionField()] || '').trim(),
    town: String(s[getSourceTownField()] || '').trim(),
  }))

  // 按行政区划预筛选
  let candList = sourceList
  if (regionFilter) {
    if (tDistrict && tTown) {
      const townMatch = sourceList.filter(s => {
        if (!s.region && !s.town) return true
        const fullRegion = REGION_SHORT_TO_FULL[s.region] || s.region
        return fullRegion === tDistrict && s.town === tTown
      })
      if (townMatch.length > 0) candList = townMatch
    } else if (tDistrict) {
      const districtMatch = sourceList.filter(s => {
        if (!s.region) return true
        const fullRegion = REGION_SHORT_TO_FULL[s.region] || s.region
        return fullRegion === tDistrict
      })
      if (districtMatch.length > 0) candList = districtMatch
    }
  }

  const isNameEmpty = !targetName || String(targetName).trim() === ''
  const isAddrEmpty = !targetAddr || String(targetAddr).trim() === ''
  const tNameStr = isNameEmpty ? '' : String(targetName).trim()
  const tDetailStr = isAddrEmpty ? '' : String(tDetail).trim()

  const allMatches = []

  for (const c of candList) {
    // 道路快速过滤：若两边都能解析出道路名，且道路名差距过大则直接跳过
    if (targetRoad) {
      const srcAddrParsed = parseDetailAddress(c.detail)
      if (srcAddrParsed.road && fuzzRatio(targetRoad, srcAddrParsed.road) < 40) continue
    }

    const sName = isNameEmpty ? 0 : calcScore(tNameStr, c.name)

    let sAddr = 0, addrConflict = null, isHard = false
    if (isAddrEmpty) {
      sAddr = 0
    } else {
      const addrResult = calcAddrScoreImproved(tDetailStr, c.detail)
      sAddr = addrResult.score
      addrConflict = addrResult.conflict
      isHard = addrResult.isHard
      if (isHard) continue
    }

    const nameOk = !isNameEmpty && sName >= nameThresh
    const addrOk = !isAddrEmpty && sAddr >= addrThresh

    if (returnAll || nameOk || addrOk) {
      allMatches.push({
        sourceId: c.id,
        name: c.name,
        addr: c.detail,
        nameScore: sName,
        addrScore: sAddr,
        dist: null, // 无距离
        conflict: addrConflict,
        sourcePoint: c.source,
      })
    }
  }

  // 排序：先按冲突，再按 -(名称+地址得分)
  allMatches.sort((a, b) => {
    const conflictA = a.conflict ? 1 : 0
    const conflictB = b.conflict ? 1 : 0
    if (conflictA !== conflictB) return conflictA - conflictB
    const scoreA = -(a.nameScore + a.addrScore)
    const scoreB = -(b.nameScore + b.addrScore)
    if (scoreA !== scoreB) return scoreA - scoreB
    return 0
  })

  return allMatches.slice(0, limit)
}

/**
 * 批量纯文本匹配（无坐标）
 */
export function batchAddressOnlyMatch(targetPoints, sourcePoints, options = {}, onProgress = null) {
  const results = []
  const total = targetPoints.length
  for (let i = 0; i < total; i++) {
    const target = targetPoints[i]
    const candidates = findAddressOnlyCandidates(target, sourcePoints, options)
    if (candidates.length > 0) {
      const best = candidates[0]
      results.push({
        target,
        bestMatch: best,
        allCandidates: candidates,
        matched: true,
      })
    } else {
      results.push({
        target,
        bestMatch: null,
        allCandidates: [],
        matched: false,
      })
    }
    if (onProgress && (i % 5 === 0 || i === total - 1)) {
      onProgress(i + 1, total)
    }
  }
  return results
}
