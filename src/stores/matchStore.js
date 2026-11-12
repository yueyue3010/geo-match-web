import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { haversineDistance, calculateSimilarity } from '../utils/geoUtils'
import { exportToCsv } from '../utils/csvParser'
import { api } from '../utils/api'
import { findSmartCandidates, batchSmartMatch, DEFAULT_NAME_THRESH, DEFAULT_ADDR_THRESH, DEFAULT_DIST_LIMIT, findAddressOnlyCandidates, batchAddressOnlyMatch } from '../utils/smartMatch'
import { detectHasCoordinates } from '../utils/csvParser'

export const useMatchStore = defineStore('match', () => {
  // ========== 数据源状态 ==========
  const sourcePoints = ref([])
  const targetPoints = ref([])
  const sourceCollection = ref('')
  const targetCollection = ref('')
  const sourceHeaders = ref([])
  const targetHeaders = ref([])
  const sourceImportMode = ref('')
  const targetImportMode = ref('')
  const sourceFileName = ref('')
  const targetFileName = ref('')
  const sourceOriginalData = ref([])
  const targetOriginalData = ref([])

  // ========== 坐标列检测 & 手动列选择（无坐标模式下的名称/地址列） ==========
  const sourceHasCoordinates = ref(true)
  const targetHasCoordinates = ref(true)
  // 手动列覆写（用户在弹窗中选择）
  const sourceColumnOverrides = ref({
    nameField: null,
    addrField: null,
    lngField: null,
    latField: null,
    uvField: null,
  })
  const targetColumnOverrides = ref({
    nameField: null,
    addrField: null,
    lngField: null,
    latField: null,
    uvField: null,
  })

  // ========== 列显示与筛选 ==========
  const sourceVisibleColumns = ref([])
  const targetVisibleColumns = ref([])
  const sourceColumnFilters = ref({})
  const targetColumnFilters = ref({})

  // ========== 分页与筛选 ==========
  const currentSourceIndex = ref(-1)
  const currentPage = ref(1)
  const pageSize = ref(10)
  const searchKeyword = ref('')
  const onlyUnmatched = ref(false)
  const selectedSourceIds = ref(new Set())

  // ========== 候选点与匹配状态 ==========
  const candidatePoints = ref([])
  const selectedCandidateId = ref(null)
  const isMatching = ref(false)
  const isLoadingSource = ref(false)
  const isLoadingTarget = ref(false)
  const hasUnsavedChanges = ref(false) // 是否有未保存的匹配结果
  const matchProgress = ref({ current: 0, total: 0, text: '' }) // 匹配进度

  // ========== 匹配模式与参数 ==========
  const matchOperationMode = ref('single') // 'single' | 'batch'
  const matchParams = ref({
    matchMode: 'comprehensive',
    bufferRadius: 300,
    candidateLimit: 20,
    onlyShowInBuffer: true,
    nameThreshold: DEFAULT_NAME_THRESH,
    addrThreshold: DEFAULT_ADDR_THRESH,
    distLimit: DEFAULT_DIST_LIMIT,
    regionFilter: true,
  })

  // ========== 弹窗状态 ==========
  const confirmDialogVisible = ref(false)
  const undoDialogVisible = ref(false)
  const selectedCandidate = ref(null)
  const locateTarget = ref(null)

  // ========== 批量匹配状态 ==========
  const batchMatchResults = ref([])
  const batchMatchDialogVisible = ref(false)
  const selectedBatchMatches = ref([])
  const lastBatchMatchedIds = ref([]) // 最近一次批量匹配修改过的源点id列表

  const userInfo = ref({
    name: '管理员',
    role: 'admin',
  })

  // ========== 计算属性 ==========
  const filteredSourcePoints = computed(() => {
    let result = [...sourcePoints.value]
    if (searchKeyword.value) {
      const kw = searchKeyword.value.toLowerCase()
      result = result.filter((p) => {
        const nameField = getSourceNameField()
        const addrField = getSourceAddrField()
        return (
          (p[nameField] && String(p[nameField]).toLowerCase().includes(kw)) ||
          (p[addrField] && String(p[addrField]).toLowerCase().includes(kw))
        )
      })
    }
    if (onlyUnmatched.value) {
      result = result.filter((p) => isPointUnmatched(p))
    }
    const filters = sourceColumnFilters.value
    const filterKeys = Object.keys(filters).filter(k => filters[k] && filters[k].length > 0)
    if (filterKeys.length > 0) {
      result = result.filter((p) => {
        return filterKeys.every(key => {
          const filterVals = filters[key]
          const cellVal = p[key]
          return filterVals.some(fv => {
            if (fv === '__EMPTY__') {
              return cellVal === null || cellVal === undefined || cellVal === ''
            }
            return String(cellVal ?? '') === String(fv)
          })
        })
      })
    }
    return result
  })

  const pagedSourcePoints = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return filteredSourcePoints.value.slice(start, start + pageSize.value)
  })

  const totalPages = computed(() =>
    Math.ceil(filteredSourcePoints.value.length / pageSize.value)
  )

  const currentSourcePoint = computed(() => {
    if (currentSourceIndex.value >= 0 && currentSourceIndex.value < sourcePoints.value.length) {
      return sourcePoints.value[currentSourceIndex.value]
    }
    return null
  })

  const stats = computed(() => {
    const total = sourcePoints.value.length
    const matched = sourcePoints.value.filter(isPointMatched).length
    return {
      totalSourcePoints: total,
      totalTargetPoints: targetPoints.value.length,
      matchedCount: matched,
      unmatchedCount: total - matched,
      todayMatched: matched,
      completionRate: total > 0 ? matched / total : 0,
    }
  })

  // ========== 动态字段获取（适配不同表头，支持用户手动覆写） ==========
  function isPointUnmatched(point) {
    const uvField = getSourceUvField()
    const value = point[uvField]
    if (value === null || value === undefined) return true
    const strValue = String(value).trim()
    return strValue === '' || strValue === '0' || strValue === '空' || strValue === 'null' || strValue === 'undefined'
  }

  function isPointMatched(point) {
    return !isPointUnmatched(point)
  }
  // 综合判断：源和目标都有坐标时，才算整体有坐标
  const bothHaveCoordinates = computed(() => sourceHasCoordinates.value && targetHasCoordinates.value)
  // 无坐标模式：只要任一方无坐标，或明确在地址匹配模式
  const inAddressOnlyMode = computed(() => !bothHaveCoordinates.value || matchParams.value.matchMode === 'address')

  // 坐标状态变化时：强制切换到对应的合法匹配模式，防止 UI 出现 active+disabled 卡死
  watch(
    bothHaveCoordinates,
    (hasCoords, oldHasCoords) => {
      if (hasCoords === oldHasCoords) return
      if (hasCoords) {
        // 从无坐标 → 有坐标：强制切回综合匹配（地址匹配会被disabled）
        if (matchParams.value.matchMode === 'address') {
          matchParams.value.matchMode = 'comprehensive'
          if (matchOperationMode.value === 'location') matchOperationMode.value = 'single'
        }
      } else {
        // 从有坐标 → 无坐标：强制切到地址匹配（综合匹配/经纬度匹配会被disabled）
        if (matchParams.value.matchMode === 'comprehensive') {
          matchParams.value.matchMode = 'address'
          if (matchOperationMode.value === 'location') matchOperationMode.value = 'single'
        }
      }
    },
    { immediate: false }
  )

  function getSourceNameField() {
    if (sourceColumnOverrides.value.nameField) return sourceColumnOverrides.value.nameField
    const candidates = ['communityN', '小区名称', '名称', 'name', '小区名']
    for (const c of candidates) {
      if (sourceHeaders.value.includes(c)) return c
    }
    return sourceHeaders.value[2] || 'communityN'
  }

  function getSourceAddrField() {
    if (sourceColumnOverrides.value.addrField) return sourceColumnOverrides.value.addrField
    const candidates = ['community1', '地址', 'addr', 'address', '小区地址']
    for (const c of candidates) {
      if (sourceHeaders.value.includes(c)) return c
    }
    return sourceHeaders.value[3] || 'community1'
  }

  function getSourceLngField() {
    if (sourceColumnOverrides.value.lngField) return sourceColumnOverrides.value.lngField
    const candidates = ['lng_bd', 'lng_gd', 'lng', 'longitude', '经度', 'WGS84_LNG']
    for (const c of candidates) {
      if (sourceHeaders.value.includes(c)) return c
    }
    return 'lng_bd'
  }

  function getSourceLatField() {
    if (sourceColumnOverrides.value.latField) return sourceColumnOverrides.value.latField
    const candidates = ['lat_bd', 'lat_gd', 'lat', 'latitude', '纬度', 'WGS84_LAT']
    for (const c of candidates) {
      if (sourceHeaders.value.includes(c)) return c
    }
    return 'lat_bd'
  }

  function getSourceUvField() {
    if (sourceColumnOverrides.value.uvField) return sourceColumnOverrides.value.uvField
    const candidates = ['uv_communi', 'uv_community_id']
    for (const c of candidates) {
      if (sourceHeaders.value.includes(c)) return c
    }
    return 'uv_communi'
  }

  function getTargetNameField() {
    if (targetColumnOverrides.value.nameField) return targetColumnOverrides.value.nameField
    const candidates = ['联城小区名称', '小区名称', '名称', 'name']
    for (const c of candidates) {
      if (targetHeaders.value.includes(c)) return c
    }
    return targetHeaders.value[1] || '联城小区名称'
  }

  function getTargetAddrField() {
    if (targetColumnOverrides.value.addrField) return targetColumnOverrides.value.addrField
    const candidates = ['联城小区地址', '地址', 'addr', 'address']
    for (const c of candidates) {
      if (targetHeaders.value.includes(c)) return c
    }
    return targetHeaders.value[2] || '联城小区地址'
  }

  function getTargetLngField() {
    if (targetColumnOverrides.value.lngField) return targetColumnOverrides.value.lngField
    const candidates = ['gaode_lng', 'lng_bd', 'lng_gd', 'lng', 'longitude', '经度', 'WGS84_LNG']
    for (const c of candidates) {
      if (targetHeaders.value.includes(c)) return c
    }
    return 'gaode_lng'
  }

  function getTargetLatField() {
    if (targetColumnOverrides.value.latField) return targetColumnOverrides.value.latField
    const candidates = ['gaode_lat', 'lat_bd', 'lat_gd', 'lat', 'latitude', '纬度', 'WGS84_LAT']
    for (const c of candidates) {
      if (targetHeaders.value.includes(c)) return c
    }
    return 'gaode_lat'
  }

  function getTargetUvField() {
    if (targetColumnOverrides.value.uvField) return targetColumnOverrides.value.uvField
    const candidates = ['uv_community_id', 'uv_communi']
    for (const c of candidates) {
      if (targetHeaders.value.includes(c)) return c
    }
    return 'uv_community_id'
  }

  function getSourcePointField() {
    const candidates = ['point', '点位', 'location', 'coords']
    for (const c of candidates) {
      if (sourceHeaders.value.includes(c)) return c
    }
    return 'point'
  }

  function getTargetPointField() {
    const candidates = ['point', '点位', 'location', 'coords']
    for (const c of candidates) {
      if (targetHeaders.value.includes(c)) return c
    }
    return 'point'
  }

  function getSourceRegionField() {
    const candidates = ['region', '区域', 'district', '区']
    for (const c of candidates) {
      if (sourceHeaders.value.includes(c)) return c
    }
    return 'region'
  }

  function getSourceTownField() {
    const candidates = ['town', '街道', 'street', 'township']
    for (const c of candidates) {
      if (sourceHeaders.value.includes(c)) return c
    }
    return 'town'
  }

  function getTargetRegionField() {
    const candidates = ['联城区域', '区域', 'region', 'district', '区']
    for (const c of candidates) {
      if (targetHeaders.value.includes(c)) return c
    }
    return '联城区域'
  }

  function getTargetTownField() {
    const candidates = ['联城街道', '街道', 'town', 'street', 'township']
    for (const c of candidates) {
      if (targetHeaders.value.includes(c)) return c
    }
    return '联城街道'
  }

  // ========== 自动切换匹配模式（根据坐标有无） ==========
  function autoAdjustMatchMode() {
    const hasData = sourcePoints.value.length > 0 && targetPoints.value.length > 0
    if (!hasData) return
    if (bothHaveCoordinates.value) {
      // 有坐标：默认综合匹配、单点模式
      if (matchParams.value.matchMode === 'address') {
        matchParams.value.matchMode = 'comprehensive'
      }
    } else {
      // 无坐标：默认地址匹配、单点模式；location 子模式不可用
      if (matchParams.value.matchMode !== 'address') {
        matchParams.value.matchMode = 'address'
      }
      if (matchOperationMode.value === 'location') {
        matchOperationMode.value = 'single'
      }
    }
  }

  // ========== MongoDB 数据加载 ==========
  /**
   * 预览数据库集合：只获取表头+数据+坐标检测结果，不修改任何状态
   * 供 HeaderToolbar 在导入前做坐标检测用
   */
  async function previewDbCollection(collectionName) {
    const res = await api.getCollectionAll(collectionName)
    const headers = res.headers || []
    const data = res.data || []
    const detect = detectHasCoordinates(headers, data)
    return { headers, data, detect }
  }

  async function loadSourceFromDb(collectionName, columnOverrides = null) {
    isLoadingSource.value = true
    try {
      const res = await api.getCollectionAll(collectionName)
      sourceHeaders.value = res.headers || []
      const data = (res.data || [])
      // 坐标检测（DB 数据默认认为有坐标，为了稳妥仍然检测）
      const detect = detectHasCoordinates(sourceHeaders.value, data)
      sourceHasCoordinates.value = detect.hasCoordinates
      if (detect.lngField) sourceColumnOverrides.value.lngField = detect.lngField
      if (detect.latField) sourceColumnOverrides.value.latField = detect.latField
      // 应用用户在弹窗中选择的列覆写
      if (columnOverrides) {
        if (columnOverrides.nameField) sourceColumnOverrides.value.nameField = columnOverrides.nameField
        if (columnOverrides.addrField) sourceColumnOverrides.value.addrField = columnOverrides.addrField
        if (columnOverrides.uvField) sourceColumnOverrides.value.uvField = columnOverrides.uvField
      } else {
        sourceColumnOverrides.value.nameField = null
        sourceColumnOverrides.value.addrField = null
        sourceColumnOverrides.value.uvField = null
      }

      const rawData = data.map((item, index) => ({
        _mongoId: item._id,
        id: index,
        ...item,
        [getSourceLngField()]: parseFloat(item[getSourceLngField()]) || 0,
        [getSourceLatField()]: parseFloat(item[getSourceLatField()]) || 0,
      }))
      // 若无 UV 字段，给源点加一个空列以便写入匹配结果
      if (!sourceHeaders.value.includes(getSourceUvField())) {
        for (const p of rawData) p[getSourceUvField()] = p[getSourceUvField()] ?? ''
        sourceHeaders.value.push(getSourceUvField())
      }
      sourcePoints.value = JSON.parse(JSON.stringify(rawData))
      sourceOriginalData.value = JSON.parse(JSON.stringify(rawData))
      sourceCollection.value = collectionName
      sourceImportMode.value = 'db'
      sourceFileName.value = ''
      sourceVisibleColumns.value = [...sourceHeaders.value]
      sourceColumnFilters.value = {}
      currentSourceIndex.value = -1
      candidatePoints.value = []
      currentPage.value = 1
      hasUnsavedChanges.value = false
      selectedSourceIds.value.clear()
      autoAdjustMatchMode()
    } finally {
      isLoadingSource.value = false
    }
  }

  async function loadTargetFromDb(collectionName, columnOverrides = null) {
    isLoadingTarget.value = true
    try {
      const res = await api.getCollectionAll(collectionName)
      targetHeaders.value = res.headers || []
      const data = (res.data || [])
      const detect = detectHasCoordinates(targetHeaders.value, data)
      targetHasCoordinates.value = detect.hasCoordinates
      if (detect.lngField) targetColumnOverrides.value.lngField = detect.lngField
      if (detect.latField) targetColumnOverrides.value.latField = detect.latField
      // 应用用户在弹窗中选择的列覆写
      if (columnOverrides) {
        if (columnOverrides.nameField) targetColumnOverrides.value.nameField = columnOverrides.nameField
        if (columnOverrides.addrField) targetColumnOverrides.value.addrField = columnOverrides.addrField
        if (columnOverrides.uvField) targetColumnOverrides.value.uvField = columnOverrides.uvField
      } else {
        targetColumnOverrides.value.nameField = null
        targetColumnOverrides.value.addrField = null
        targetColumnOverrides.value.uvField = null
      }

      const rawData = data.map((item, index) => ({
        _mongoId: item._id,
        id: index,
        ...item,
        [getTargetLngField()]: parseFloat(item[getTargetLngField()]) || 0,
        [getTargetLatField()]: parseFloat(item[getTargetLatField()]) || 0,
      }))
      targetPoints.value = JSON.parse(JSON.stringify(rawData))
      targetOriginalData.value = JSON.parse(JSON.stringify(rawData))
      targetCollection.value = collectionName
      targetImportMode.value = 'db'
      targetFileName.value = ''
      targetVisibleColumns.value = [...targetHeaders.value]
      targetColumnFilters.value = {}
      candidatePoints.value = []
      autoAdjustMatchMode()
    } finally {
      isLoadingTarget.value = false
    }
  }

  // ========== 本地CSV文件加载 ==========
  async function loadSourceFromLocal(file, fileName, columnOverrides = null) {
    isLoadingSource.value = true
    try {
      const { parseCsvFile, suggestUvColumn } = await import('../utils/csvParser')
      const data = await parseCsvFile(file)
      if (data.length === 0) throw new Error('CSV文件内容为空')
      sourceHeaders.value = Object.keys(data[0])

      // 坐标检测
      const detect = detectHasCoordinates(sourceHeaders.value, data)
      sourceHasCoordinates.value = detect.hasCoordinates
      if (detect.lngField) sourceColumnOverrides.value.lngField = detect.lngField
      if (detect.latField) sourceColumnOverrides.value.latField = detect.latField

      // 若用户提供了列选择覆写（无坐标模式下在弹窗中选的）
      if (columnOverrides) {
        sourceColumnOverrides.value.nameField = columnOverrides.nameField || null
        sourceColumnOverrides.value.addrField = columnOverrides.addrField || null
        if (columnOverrides.uvField) sourceColumnOverrides.value.uvField = columnOverrides.uvField
        if (columnOverrides.lngField) sourceColumnOverrides.value.lngField = columnOverrides.lngField
        if (columnOverrides.latField) sourceColumnOverrides.value.latField = columnOverrides.latField
      } else {
        sourceColumnOverrides.value.nameField = null
        sourceColumnOverrides.value.addrField = null
        // 若 CSV 里没有 uv 列，自动挑一个合适的，或者新建一列用于保存匹配结果
        if (!suggestUvColumn(sourceHeaders.value)) {
          // 追加一个 uv_communi 空列
          for (const row of data) row.uv_communi = ''
          if (!sourceHeaders.value.includes('uv_communi')) sourceHeaders.value.push('uv_communi')
          sourceColumnOverrides.value.uvField = 'uv_communi'
        } else {
          sourceColumnOverrides.value.uvField = null
        }
      }

      const rawData = data.map((item, index) => ({
        id: index,
        ...item,
        [getSourceLngField()]: parseFloat(item[getSourceLngField()]) || 0,
        [getSourceLatField()]: parseFloat(item[getSourceLatField()]) || 0,
      }))
      sourcePoints.value = JSON.parse(JSON.stringify(rawData))
      sourceOriginalData.value = JSON.parse(JSON.stringify(rawData))
      sourceFileName.value = fileName
      sourceCollection.value = fileName.replace(/\.csv$/i, '')
      sourceImportMode.value = 'local'
      sourceVisibleColumns.value = [...sourceHeaders.value]
      sourceColumnFilters.value = {}
      currentSourceIndex.value = -1
      candidatePoints.value = []
      currentPage.value = 1
      hasUnsavedChanges.value = false
      selectedSourceIds.value.clear()
      autoAdjustMatchMode()
      return detect
    } finally {
      isLoadingSource.value = false
    }
  }

  async function loadTargetFromLocal(file, fileName, columnOverrides = null) {
    isLoadingTarget.value = true
    try {
      const { parseCsvFile } = await import('../utils/csvParser')
      const data = await parseCsvFile(file)
      if (data.length === 0) throw new Error('CSV文件内容为空')
      targetHeaders.value = Object.keys(data[0])

      const detect = detectHasCoordinates(targetHeaders.value, data)
      targetHasCoordinates.value = detect.hasCoordinates
      if (detect.lngField) targetColumnOverrides.value.lngField = detect.lngField
      if (detect.latField) targetColumnOverrides.value.latField = detect.latField

      if (columnOverrides) {
        targetColumnOverrides.value.nameField = columnOverrides.nameField || null
        targetColumnOverrides.value.addrField = columnOverrides.addrField || null
        if (columnOverrides.uvField) targetColumnOverrides.value.uvField = columnOverrides.uvField
        if (columnOverrides.lngField) targetColumnOverrides.value.lngField = columnOverrides.lngField
        if (columnOverrides.latField) targetColumnOverrides.value.latField = columnOverrides.latField
      } else {
        targetColumnOverrides.value.nameField = null
        targetColumnOverrides.value.addrField = null
        targetColumnOverrides.value.uvField = null
      }

      const rawData = data.map((item, index) => ({
        id: index,
        ...item,
        [getTargetLngField()]: parseFloat(item[getTargetLngField()]) || 0,
        [getTargetLatField()]: parseFloat(item[getTargetLatField()]) || 0,
      }))
      targetPoints.value = JSON.parse(JSON.stringify(rawData))
      targetOriginalData.value = JSON.parse(JSON.stringify(rawData))
      targetFileName.value = fileName
      targetCollection.value = fileName.replace(/\.csv$/i, '')
      targetImportMode.value = 'local'
      targetVisibleColumns.value = [...targetHeaders.value]
      targetColumnFilters.value = {}
      candidatePoints.value = []
      autoAdjustMatchMode()
      return detect
    } finally {
      isLoadingTarget.value = false
    }
  }

  // ========== 匹配逻辑 ==========
  function selectSourcePoint(point) {
    const idx = sourcePoints.value.findIndex((p) => p.id === point.id)
    currentSourceIndex.value = idx
    candidatePoints.value = []
    selectedCandidateId.value = null
  }

  function toggleSourceSelection(id) {
    if (selectedSourceIds.value.has(id)) {
      selectedSourceIds.value.delete(id)
    } else {
      selectedSourceIds.value.add(id)
    }
  }

  function selectAllSourcePoints(selectAll) {
    if (selectAll) {
      for (const p of sourcePoints.value) {
        selectedSourceIds.value.add(p.id)
      }
    } else {
      selectedSourceIds.value.clear()
    }
  }

  function clearSourceSelection() {
    selectedSourceIds.value.clear()
  }

  function findCandidates() {
    if (!currentSourcePoint.value) {
      console.warn('[findCandidates] 没有选择待匹配点')
      return
    }
    if (targetPoints.value.length === 0) {
      console.warn('[findCandidates] 目标点数据为空')
      return
    }

    isMatching.value = true
    matchProgress.value = { current: 0, total: 1, text: '正在搜索候选点...' }

    // 共用的通用选项
    const commonOpts = {
      returnAll: true,
      regionFilter: matchParams.value.regionFilter,
      getTargetNameField: getSourceNameField,
      getTargetAddrField: getSourceAddrField,
      getTargetPointField: getSourcePointField,
      getTargetLngField: getSourceLngField,
      getTargetLatField: getSourceLatField,
      getTargetRegionField: getSourceRegionField,
      getTargetTownField: getSourceTownField,
      getSourceNameField: getTargetNameField,
      getSourceAddrField: getTargetAddrField,
      getSourceRegionField: getTargetRegionField,
      getSourceTownField: getTargetTownField,
      getSourcePointField: getTargetPointField,
      getSourceLngField: getTargetLngField,
      getSourceLatField: getTargetLatField,
      getSourceIdField: getTargetUvField,
    }

    setTimeout(() => {
      try {
        const source = currentSourcePoint.value
        const limit = matchParams.value.candidateLimit
        const distLimit = matchParams.value.distLimit
        const sourceUvValue = source[getSourceUvField()]
        const targetUvField = getTargetUvField()
        const sourceAlreadyMatched = isPointMatched(source)

        let candidates = []
        const useAddressOnly = inAddressOnlyMode.value

        if (matchOperationMode.value === 'location') {
          if (!bothHaveCoordinates.value) {
            ElMessage.warning('当前数据没有经纬度，无法使用经纬度匹配，请使用地址匹配')
            isMatching.value = false
            matchProgress.value = { current: 0, total: 0, text: '' }
            return
          }
          console.log('[findCandidates] 使用经纬度匹配')
          const sourceLng = source[getSourceLngField()]
          const sourceLat = source[getSourceLatField()]

          const results = targetPoints.value
            .map(target => {
              const targetLng = target[getTargetLngField()]
              const targetLat = target[getTargetLatField()]
              const dist = haversineDistance(sourceLng, sourceLat, targetLng, targetLat)
              return { target, dist }
            })
            .filter(r => r.dist <= distLimit)
            .sort((a, b) => a.dist - b.dist)

          candidates = results.slice(0, limit).map((r, index) => {
            const target = r.target
            const isMatchedTarget = sourceAlreadyMatched && String(target[targetUvField]) === String(sourceUvValue)
            const score = Math.round((1 - r.dist / distLimit) * 100)

            return {
              ...target,
              distance: r.dist,
              score: score / 100,
              nameScore: 0,
              addrScore: 0,
              totalScore: score,
              confirmed: isMatchedTarget,
              checked: false,
              conflict: null,
            }
          })
        } else if (useAddressOnly) {
          console.log('[findCandidates] 使用地址匹配（仅文本）')
          const results = findAddressOnlyCandidates(source, targetPoints.value, {
            nameThresh: matchParams.value.nameThreshold,
            addrThresh: matchParams.value.addrThreshold,
            limit,
            ...commonOpts,
          })

          candidates = results.map((r) => {
            const target = r.sourcePoint
            const isMatchedTarget = sourceAlreadyMatched && String(target[targetUvField]) === String(sourceUvValue)
            return {
              ...target,
              distance: null,
              score: Math.round((r.nameScore + r.addrScore) / 2) / 100,
              nameScore: r.nameScore,
              addrScore: r.addrScore,
              totalScore: Math.round((r.nameScore + r.addrScore) / 2),
              confirmed: isMatchedTarget,
              checked: false,
              conflict: r.conflict,
            }
          })
        } else {
          console.log('[findCandidates] 使用综合匹配')
          const results = findSmartCandidates(source, targetPoints.value, {
            nameThresh: matchParams.value.nameThreshold,
            addrThresh: matchParams.value.addrThreshold,
            distLimit: matchParams.value.distLimit,
            ...commonOpts,
          })

          candidates = results.slice(0, limit).map((r) => {
            const target = r.sourcePoint
            const isMatchedTarget = sourceAlreadyMatched && String(target[targetUvField]) === String(sourceUvValue)

            return {
              ...target,
              distance: r.dist,
              score: Math.round((r.nameScore + r.addrScore) / 2) / 100,
              nameScore: r.nameScore,
              addrScore: r.addrScore,
              totalScore: Math.round((r.nameScore + r.addrScore) / 2),
              confirmed: isMatchedTarget,
              checked: false,
              conflict: r.conflict,
            }
          })
        }

        if (sourceAlreadyMatched) {
          const hasMatchedInCandidates = candidates.some(c => c.confirmed)
          if (!hasMatchedInCandidates) {
            const matchedTarget = targetPoints.value.find(t => String(t[targetUvField]) === String(sourceUvValue))
            if (matchedTarget) {
              candidates.unshift({
                ...matchedTarget,
                distance: useAddressOnly ? null : -1,
                score: 1,
                nameScore: 100,
                addrScore: 100,
                totalScore: 100,
                confirmed: true,
                checked: false,
                conflict: null,
              })
            }
          }
        }

        candidatePoints.value = candidates

        matchProgress.value = { current: 1, total: 1, text: `找到 ${candidates.length} 个候选点` }

        console.log('[findCandidates] 找到候选点数量:', candidatePoints.value.length)

        if (candidatePoints.value.length > 0) {
          selectedCandidateId.value = candidatePoints.value[0].id
          console.log('[findCandidates] 首个候选点id:', selectedCandidateId.value)
        } else {
          selectedCandidateId.value = null
        }
      } catch (err) {
        console.error('[findCandidates] 匹配出错:', err)
        ElMessage.error('匹配出错: ' + err.message)
      } finally {
        isMatching.value = false
        setTimeout(() => {
          matchProgress.value = { current: 0, total: 0, text: '' }
        }, 800)
      }
    }, 50)
  }

  // ========== 批量匹配 ==========
  function batchMatch() {
    if (targetPoints.value.length === 0) {
      console.warn('[batchMatch] 目标点数据为空')
      ElMessage.warning('请先导入候选点数据')
      return
    }

    // 获取要匹配的点：优先使用勾选的点，否则使用所有未匹配点
    let pointsToMatch
    if (selectedSourceIds.value.size > 0) {
      pointsToMatch = sourcePoints.value.filter(p => selectedSourceIds.value.has(p.id))
      if (pointsToMatch.length === 0) {
        ElMessage.warning('勾选的点不存在')
        return
      }
    } else {
      pointsToMatch = sourcePoints.value.filter(p => isPointUnmatched(p))
      if (pointsToMatch.length === 0) {
        console.warn('[batchMatch] 没有未匹配的点')
        ElMessage.warning('没有未匹配的点了')
        return
      }
    }

    console.log('[batchMatch] 开始批量匹配，匹配点数:', pointsToMatch.length)
    isMatching.value = true
    matchProgress.value = {
      current: 0,
      total: pointsToMatch.length,
      text: `准备批量匹配 ${pointsToMatch.length} 个点...`
    }

    const commonOpts = {
      regionFilter: matchParams.value.regionFilter,
      getTargetNameField: getSourceNameField,
      getTargetAddrField: getSourceAddrField,
      getTargetPointField: getSourcePointField,
      getTargetLngField: getSourceLngField,
      getTargetLatField: getSourceLatField,
      getTargetRegionField: getSourceRegionField,
      getTargetTownField: getSourceTownField,
      getSourceNameField: getTargetNameField,
      getSourceAddrField: getTargetAddrField,
      getSourceRegionField: getTargetRegionField,
      getSourceTownField: getTargetTownField,
      getSourcePointField: getTargetPointField,
      getSourceLngField: getTargetLngField,
      getSourceLatField: getTargetLatField,
      getSourceIdField: getTargetUvField,
    }

    // 让 UI 有机会刷新显示进度
    setTimeout(() => {
      try {
        const useAddressOnly = inAddressOnlyMode.value
        const matcherFn = useAddressOnly ? batchAddressOnlyMatch : batchSmartMatch
        const extraOpts = useAddressOnly ? {} : { distLimit: matchParams.value.distLimit }

        const results = matcherFn(pointsToMatch, targetPoints.value, {
          nameThresh: matchParams.value.nameThreshold,
          addrThresh: matchParams.value.addrThreshold,
          ...extraOpts,
          ...commonOpts,
        }, (current, total) => {
          matchProgress.value = {
            current,
            total,
            text: `批量匹配中 ${current}/${total}`
          }
        })

        // 过滤出匹配成功的结果，默认全部选中
        const matchedResults = results.filter(r => r.matched).map(r => ({
          target: r.target,
          bestMatch: {
            name: r.bestMatch.sourcePoint[getTargetNameField()],
            addr: r.bestMatch.sourcePoint[getTargetAddrField()],
            sourceId: r.bestMatch.sourcePoint[getTargetUvField()],
            nameScore: r.bestMatch.nameScore,
            addrScore: r.bestMatch.addrScore,
            dist: r.bestMatch.dist,
            conflict: r.bestMatch.conflict,
          },
          selected: true,
        }))

        batchMatchResults.value = matchedResults
        selectedBatchMatches.value = []
        batchMatchDialogVisible.value = true

        matchProgress.value = {
          current: pointsToMatch.length,
          total: pointsToMatch.length,
          text: `匹配完成，共找到 ${matchedResults.length} 条候选结果`
        }

        console.log('[batchMatch] 批量匹配完成，匹配成功:', matchedResults.length)
        ElMessage.success(`批量匹配完成，成功匹配 ${matchedResults.length} 条`)
      } catch (err) {
        console.error('[batchMatch] 批量匹配出错:', err)
        ElMessage.error('批量匹配出错: ' + err.message)
      } finally {
        isMatching.value = false
        setTimeout(() => {
          matchProgress.value = { current: 0, total: 0, text: '' }
        }, 1000)
      }
    }, 100)
  }

  function applyBatchMatch() {
    const selected = batchMatchResults.value.filter(r => r.selected)
    const uvField = getSourceUvField()
    const targetUvField = getTargetUvField()

    const modifiedIds = []
    for (const item of selected) {
      const target = item.target
      const best = item.bestMatch
      const sourceIdx = sourcePoints.value.findIndex(p => p.id === target.id)
      if (sourceIdx >= 0) {
        sourcePoints.value[sourceIdx][uvField] = best.sourceId
        sourcePoints.value[sourceIdx].matchStatus = 'matched'
        sourcePoints.value[sourceIdx].matchedTargetName = best.name
        sourcePoints.value[sourceIdx].matchedAt = new Date().toISOString()
        modifiedIds.push(sourcePoints.value[sourceIdx].id)
      }
    }

    // 记录最近一次批量匹配修改过的源点id
    lastBatchMatchedIds.value = modifiedIds

    batchMatchDialogVisible.value = false
    batchMatchResults.value = []
    selectedBatchMatches.value = []

    // 标记有未保存的匹配结果
    hasUnsavedChanges.value = true
  }

  function toggleBatchMatchSelection(targetId) {
    const item = batchMatchResults.value.find(r => r.target.id === targetId)
    if (item) {
      item.selected = !item.selected
    }
  }

  function selectAllBatchMatches(selected) {
    for (const item of batchMatchResults.value) {
      item.selected = selected
    }
  }

  // ========== 确认匹配 ==========
  function confirmMatch(candidate) {
    selectedCandidate.value = candidate
    confirmDialogVisible.value = true
  }

  async function doConfirmMatch() {
    if (!currentSourcePoint.value || !selectedCandidate.value) return

    const source = currentSourcePoint.value
    const candidate = selectedCandidate.value
    const uvField = getSourceUvField()
    const targetUvField = getTargetUvField()

    source[uvField] = candidate[targetUvField]
    source.matchStatus = 'matched'
    source.matchedTargetName = candidate[getTargetNameField()]
    source.matchedAt = new Date().toISOString()

    // 清除所有候选点的 confirmed 状态，然后设置新的确认状态
    candidatePoints.value.forEach(c => {
      c.confirmed = false
    })
    
    const idx = candidatePoints.value.findIndex((c) => c.id === candidate.id)
    if (idx >= 0) {
      candidatePoints.value[idx].confirmed = true
    }

    selectedCandidateId.value = candidate.id

    confirmDialogVisible.value = false
    selectedCandidate.value = null
    hasUnsavedChanges.value = true
  }

  async function markAsNoMatch() {
    if (!currentSourcePoint.value) return
    const uvField = getSourceUvField()
    currentSourcePoint.value[uvField] = '0'
    currentSourcePoint.value.matchStatus = 'none'
    hasUnsavedChanges.value = true // 标记有未保存的匹配结果
  }

  function undoLastBatchMatch(ids = null) {
    const targetIds = ids || [...lastBatchMatchedIds.value]
    if (targetIds.length === 0) return 0
    const uvField = getSourceUvField()
    let count = 0
    for (const id of targetIds) {
      const source = sourcePoints.value.find(p => p.id === id)
      if (!source) continue
      const original = sourceOriginalData.value.find(p => p.id === source.id)
      if (original) {
        source[uvField] = original[uvField] !== undefined ? original[uvField] : ''
      } else {
        source[uvField] = ''
      }
      source.matchStatus = isPointUnmatched(source) ? 'unmatched' : 'matched'
      source.matchedTargetName = ''
      source.matchedAt = null
      count++
      // 从 lastBatchMatchedIds 中移除已撤回的 ID
      const idx = lastBatchMatchedIds.value.indexOf(id)
      if (idx > -1) {
        lastBatchMatchedIds.value.splice(idx, 1)
      }
    }
    // 如果当前选中点在撤回范围内，刷新候选列表
    if (currentSourcePoint.value && targetIds.includes(currentSourcePoint.value.id)) {
      findCandidates()
    }
    return count
  }

  function undoMatch(uvCommunityId) {
    const uvField = getSourceUvField()
    const source = sourcePoints.value.find(
      (p) => String(p[uvField]) === String(uvCommunityId)
    )
    if (source) {
      // 恢复原始 uv_communi 值（从 sourceOriginalData 中查找）
      const original = sourceOriginalData.value.find(p => p.id === source.id)
      if (original) {
        source[uvField] = original[uvField] !== undefined ? original[uvField] : ''
      } else {
        source[uvField] = ''
      }
      source.matchStatus = isPointUnmatched(source) ? 'unmatched' : 'matched'
      source.matchedTargetName = ''
      source.matchedAt = null
    }
    undoDialogVisible.value = false
    // 重新触发当前点的候选搜索，恢复地图/右侧显示
    if (currentSourcePoint.value && currentSourcePoint.value.id === source?.id) {
      findCandidates()
    }
  }

  function undoCurrentMatch() {
    if (!currentSourcePoint.value) return
    const uvField = getSourceUvField()
    const source = currentSourcePoint.value
    // 恢复原始 uv_communi 值
    const original = sourceOriginalData.value.find(p => p.id === source.id)
    if (original) {
      source[uvField] = original[uvField] !== undefined ? original[uvField] : ''
    } else {
      source[uvField] = ''
    }
    source.matchStatus = isPointUnmatched(source) ? 'unmatched' : 'matched'
    source.matchedTargetName = ''
    source.matchedAt = null
    // 重新触发候选搜索
    findCandidates()
  }

  function openUndoDialog() {
    undoDialogVisible.value = true
  }

  function locateCandidate(candidate) {
    locateTarget.value = {
      lng: candidate[getTargetLngField()],
      lat: candidate[getTargetLatField()],
      name: candidate[getTargetNameField()],
      address: candidate[getTargetAddrField()],
      timestamp: Date.now(),
    }
  }

  // ========== 自动保存副本 ==========
  async function autoSaveToCopy() {
    try {
      if (sourceImportMode.value === 'db' && sourceCollection.value) {
        const copyName = `${sourceCollection.value}_matching`
        const cleanData = sourcePoints.value.map(p => {
          const { _id, _mongoId, id, ...rest } = p
          return rest
        })
        await api.saveCollection(copyName, cleanData)
      } else if (sourceImportMode.value === 'local' && sourceFileName.value) {
        const baseName = sourceFileName.value.replace(/\.csv$/i, '')
        const filename = `${baseName}_匹配结果.csv`
        const exportData = sourcePoints.value.map(p => {
          const { id, ...rest } = p
          return rest
        })
        exportToCsv(exportData, filename)
      }
    } catch (err) {
      console.error('自动保存副本失败:', err)
    }
  }

  // ========== 手动保存结果 ==========
  async function saveResults() {
    if (sourcePoints.value.length === 0) {
      throw new Error('请先导入待匹配数据')
    }
    let result
    if (sourceImportMode.value === 'db') {
      const copyName = `${sourceCollection.value}_matching`
      const cleanData = sourcePoints.value.map(p => {
        const { _id, _mongoId, id, ...rest } = p
        return rest
      })
      await api.saveCollection(copyName, cleanData)
      result = { type: 'db', name: copyName }
    } else {
      const timestamp = new Date()
      const dateStr = timestamp.getFullYear().toString() +
        String(timestamp.getMonth() + 1).padStart(2, '0') +
        String(timestamp.getDate()).padStart(2, '0') + '_' +
        String(timestamp.getHours()).padStart(2, '0') +
        String(timestamp.getMinutes()).padStart(2, '0') +
        String(timestamp.getSeconds()).padStart(2, '0')
      const baseName = (sourceFileName.value || 'result').replace(/\.csv$/i, '')
      const filename = `${baseName}_匹配结果_${dateStr}.csv`
      const exportData = sourcePoints.value.map(p => {
        const { id, ...rest } = p
        return rest
      })
      exportToCsv(exportData, filename)
      result = { type: 'local', name: filename }
    }
    hasUnsavedChanges.value = false // 保存成功后重置
    return result
  }

  function exportResults() {
    if (sourcePoints.value.length === 0) return
    const timestamp = new Date()
    const dateStr = timestamp.getFullYear().toString() +
      String(timestamp.getMonth() + 1).padStart(2, '0') +
      String(timestamp.getDate()).padStart(2, '0') + '_' +
      String(timestamp.getHours()).padStart(2, '0') +
      String(timestamp.getMinutes()).padStart(2, '0') +
      String(timestamp.getSeconds()).padStart(2, '0')
    const filename = `${sourceCollection.value || 'result'}_匹配结果_${dateStr}.csv`
    exportToCsv(sourcePoints.value, filename)
  }

  function nextUnmatched() {
    const idx = sourcePoints.value.findIndex(isPointUnmatched)
    if (idx >= 0) {
      currentSourceIndex.value = idx
      candidatePoints.value = []
    }
  }

  return {
    // state
    sourcePoints,
    targetPoints,
    sourceCollection,
    targetCollection,
    sourceHeaders,
    targetHeaders,
    sourceImportMode,
    targetImportMode,
    sourceFileName,
    targetFileName,
    sourceOriginalData,
    targetOriginalData,
    sourceHasCoordinates,
    targetHasCoordinates,
    bothHaveCoordinates,
    inAddressOnlyMode,
    sourceColumnOverrides,
    targetColumnOverrides,
    sourceVisibleColumns,
    targetVisibleColumns,
    sourceColumnFilters,
    targetColumnFilters,
    currentSourceIndex,
    currentSourcePoint,
    candidatePoints,
    selectedCandidateId,
    isMatching,
    isLoadingSource,
    isLoadingTarget,
    hasUnsavedChanges,
    matchProgress,
    matchOperationMode,
    matchParams,
    confirmDialogVisible,
    undoDialogVisible,
    selectedCandidate,
    locateTarget,
    batchMatchResults,
    batchMatchDialogVisible,
    selectedBatchMatches,
    lastBatchMatchedIds,
    selectedSourceIds,
    userInfo,
    stats,
    currentPage,
    pageSize,
    searchKeyword,
    onlyUnmatched,
    filteredSourcePoints,
    pagedSourcePoints,
    totalPages,
    // getters
    isPointMatched,
    isPointUnmatched,
    autoAdjustMatchMode,
    getSourceNameField,
    getSourceAddrField,
    getSourceLngField,
    getSourceLatField,
    getSourceUvField,
    getTargetNameField,
    getTargetAddrField,
    getTargetLngField,
    getTargetLatField,
    getTargetUvField,
    getSourcePointField,
    getTargetPointField,
    getSourceRegionField,
    getSourceTownField,
    getTargetRegionField,
    getTargetTownField,
    // actions
    loadSourceFromDb,
    loadTargetFromDb,
    previewDbCollection,
    loadSourceFromLocal,
    loadTargetFromLocal,
    selectSourcePoint,
    toggleSourceSelection,
    selectAllSourcePoints,
    clearSourceSelection,
    findCandidates,
    batchMatch,
    applyBatchMatch,
    toggleBatchMatchSelection,
    selectAllBatchMatches,
    confirmMatch,
    doConfirmMatch,
    markAsNoMatch,
    undoMatch,
    undoCurrentMatch,
    undoLastBatchMatch,
    openUndoDialog,
    locateCandidate,
    saveResults,
    exportResults,
    nextUnmatched,
  }
})
