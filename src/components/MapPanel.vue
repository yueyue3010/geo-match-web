<template>
  <div class="map-panel">
    <div ref="mapContainer" class="map-container"></div>

    <!-- 高德底图不可用时的离线示意视图（演示环境兜底） -->
    <FallbackMap v-if="mapFailed" />

    <!-- 无坐标模式提示卡 -->
    <div v-if="!bothHaveCoordinates" class="no-coordinates-tip">
      <el-icon :size="16" color="#86909c"><Warning /></el-icon>
      <span>当前数据无经纬度坐标，已切换为「仅文本地址匹配」模式，地图不显示点位</span>
    </div>

    <div class="legend-panel">
      <div class="legend-title">图例</div>
      <template v-if="bothHaveCoordinates">
        <div class="legend-item">
          <span class="legend-dot source"></span>
          <span class="legend-text">待匹配点</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot best"></span>
          <span class="legend-text">最佳匹配</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot candidate"></span>
          <span class="legend-text">候选点</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot matched"></span>
          <span class="legend-text">已确认匹配</span>
        </div>
        <div class="legend-item" v-if="bufferVisible">
          <span class="legend-circle"></span>
          <span class="legend-text">缓冲区范围</span>
        </div>
      </template>
      <template v-else>
        <div class="legend-empty">无坐标，仅文本匹配</div>
      </template>
    </div>

    <div class="map-controls">
      <button class="map-control-btn" title="重置视图" @click="fitAllMarkers" :disabled="!bothHaveCoordinates">
        <el-icon><FullScreen /></el-icon>
      </button>
      <button class="map-control-btn" title="回到当前点" @click="backToCurrent" :disabled="!currentSourcePoint || !bothHaveCoordinates">
        <el-icon><Aim /></el-icon>
      </button>
    </div>

    <div v-if="currentSourcePoint" class="source-info-card">
      <div class="info-header">
        <span class="info-title">待匹配点</span>
        <span class="info-close" @click="closeSourceInfo">×</span>
      </div>
      <div class="info-row">
        <span class="info-label">名称：</span>
        <span class="info-value" :title="currentSourcePoint[getSourceNameField()]">{{ currentSourcePoint[getSourceNameField()] }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">地址：</span>
        <span class="info-value" :title="currentSourcePoint[getSourceAddrField()]">{{ currentSourcePoint[getSourceAddrField()] }}</span>
      </div>
      <div class="info-row" v-if="bothHaveCoordinates">
        <span class="info-label">{{ getSourceLngField() }}：</span>
        <span class="info-value">{{ currentSourcePoint[getSourceLngField()] }}</span>
      </div>
      <div class="info-row" v-if="bothHaveCoordinates">
        <span class="info-label">{{ getSourceLatField() }}：</span>
        <span class="info-value">{{ currentSourcePoint[getSourceLatField()] }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">{{ getSourceUvField() }}：</span>
        <span class="info-value" :class="{ 'is-empty': !currentSourcePoint[getSourceUvField()] || currentSourcePoint[getSourceUvField()] === '空' }">
          {{ currentSourcePoint[getSourceUvField()] || '空' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount, nextTick, computed } from 'vue'
import { useMatchStore } from '../stores/matchStore'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { Warning } from '@element-plus/icons-vue'
import FallbackMap from './FallbackMap.vue'

const matchStore = useMatchStore()
const { currentSourcePoint, candidatePoints, matchParams, locateTarget, bothHaveCoordinates } = storeToRefs(matchStore)

// 动态字段方法
const getSourceNameField = matchStore.getSourceNameField
const getSourceAddrField = matchStore.getSourceAddrField
const getSourceLngField = matchStore.getSourceLngField
const getSourceLatField = matchStore.getSourceLatField
const getSourceUvField = matchStore.getSourceUvField
const getTargetNameField = matchStore.getTargetNameField
const getTargetAddrField = matchStore.getTargetAddrField
const getTargetLngField = matchStore.getTargetLngField
const getTargetLatField = matchStore.getTargetLatField
const getTargetUvField = matchStore.getTargetUvField

const mapContainer = ref(null)
const bufferVisible = ref(false)
const mapFailed = ref(false)
let map = null
let sourceMarker = null
let bufferCircle = null
let candidateMarkers = []
let activeInfoWindow = null
let amapRetry = 0
let mapReady = false

onMounted(() => {
  initMap()
})

onBeforeUnmount(() => {
  window.removeEventListener('error', handleGlobalError)
  if (map) {
    map.destroy()
    map = null
  }
})

function initMap() {
  if (mapFailed.value) return
  if (!window.AMap) {
    amapRetry += 1
    // 6 秒内仍未加载到高德 SDK，切换到离线示意视图
    if (amapRetry > 12) {
      mapFailed.value = true
      return
    }
    setTimeout(initMap, 500)
    return
  }

  try {
    map = new window.AMap.Map(mapContainer.value, {
      zoom: 14,
      center: [121.4737, 31.2304],
      viewMode: '2D',
      mapStyle: 'amap://styles/normal',
    })

    map.addControl(new window.AMap.Scale())
    map.addControl(new window.AMap.ToolBar({ position: 'LT' }))

    // 底图首帧渲染完成即认为在线地图可用，撤掉离线兜底视图
    map.on('complete', () => {
      mapReady = true
      mapFailed.value = false
    })
  } catch (err) {
    console.warn('[map] 高德地图初始化失败，切换离线示意视图', err)
    mapFailed.value = true
    return
  }

  // 兜底判定：Key 域名受限 / 网络不可达时底图迟迟不渲染，9 秒后切离线示意视图
  setTimeout(() => {
    if (!mapReady) mapFailed.value = true
  }, 9000)
}

// 高德 Key 校验失败（域名白名单 / Key 不匹配）时 SDK 只抛控制台错误、底图空白，
// 这里统一捕获后切换兜底视图
function handleGlobalError(event) {
  const msg = `${event?.message || ''}`
  if (/INVALID_USER_DOMAIN|INVALID_USER_KEY|USERKEY_PLAT_NOMATCH|INVALID_USER_SCODE/i.test(msg)) {
    mapReady = false
    mapFailed.value = true
  }
}

window.addEventListener('error', handleGlobalError)

function closeSourceInfo() {
  matchStore.currentSourceIndex = -1
}

watch(
  currentSourcePoint,
  (point) => {
    if (!map) return
    clearSourceMarker()
    clearCandidateMarkers()

    // 无坐标模式：不显示任何点位
    if (!bothHaveCoordinates.value) return

    const lng = point?.[getSourceLngField()]
    const lat = point?.[getSourceLatField()]

    if (point && lng && lat) {
      addSourceMarker(point)
      addBufferCircle(point)
      
      if (candidatePoints.value && candidatePoints.value.length > 0) {
        addCandidateMarkers(candidatePoints.value)
        fitAllMarkers()
      } else {
        map.setCenter([lng, lat])
        map.setZoom(16)
      }
    }
  },
  { deep: true }
)

watch(
  candidatePoints,
  (points) => {
    if (!map) return
    clearCandidateMarkers()

    // 无坐标模式：不显示点位
    if (!bothHaveCoordinates.value) return

    // 重新绘制缓冲区（半径可能已改变）
    if (currentSourcePoint.value && bufferCircle) {
      map.remove(bufferCircle)
      bufferCircle = null
      addBufferCircle(currentSourcePoint.value)
    }

    if (points && points.length > 0) {
      addCandidateMarkers(points)
      fitAllMarkers()
    }
  },
  { deep: true }
)

watch(
  () => matchParams.value.distLimit,
  () => {
    if (!map || !currentSourcePoint.value) return
    if (!bothHaveCoordinates.value) return
    if (bufferCircle) {
      map.remove(bufferCircle)
      bufferCircle = null
    }
    addBufferCircle(currentSourcePoint.value)
  }
)

watch(
  bothHaveCoordinates,
  (hasCoords) => {
    if (!map) return
    if (!hasCoords) {
      clearSourceMarker()
      clearCandidateMarkers()
    }
  }
)

watch(
  locateTarget,
  (target) => {
    if (!map || !target) return
    map.setCenter([target.lng, target.lat])
    map.setZoom(18)
  },
  { deep: true }
)

function addSourceMarker(point) {
  const lng = parseFloat(point[getSourceLngField()]) || 0
  const lat = parseFloat(point[getSourceLatField()]) || 0

  sourceMarker = new window.AMap.Marker({
    position: [lng, lat],
    content: '<div style="width:18px;height:18px;border-radius:50%;background:#1677ff;box-shadow:0 0 0 3px rgba(22,119,255,0.3);border:2px solid #fff;"></div>',
    offset: new window.AMap.Pixel(0, 0),
    zIndex: 100,
    anchor: 'center',
  })

  const uvField = getSourceUvField()
  const infoWindow = new window.AMap.InfoWindow({
    content: `
      <div style="padding:10px;min-width:200px;">
        <div style="font-weight:600;font-size:14px;color:#1d2129;margin-bottom:6px;">${point[getSourceNameField()] || ''}</div>
        <div style="font-size:12px;color:#4e5969;margin-bottom:4px;">地址：${point[getSourceAddrField()] || ''}</div>
        <div style="font-size:12px;color:#4e5969;margin-bottom:4px;">${uvField}：${point[uvField] || '空'}</div>
      </div>
    `,
    offset: new window.AMap.Pixel(0, -12),
  })

  sourceMarker.on('click', () => {
    infoWindow.open(map, sourceMarker.getPosition())
  })

  map.add(sourceMarker)
}

function addBufferCircle(point) {
  const lng = parseFloat(point[getSourceLngField()]) || 0
  const lat = parseFloat(point[getSourceLatField()]) || 0

  bufferCircle = new window.AMap.Circle({
    center: [lng, lat],
    radius: matchParams.value.distLimit,
    strokeColor: '#1677ff',
    strokeWeight: 2,
    strokeOpacity: 0.8,
    strokeStyle: 'dashed',
    fillColor: '#1677ff',
    fillOpacity: 0.1,
    zIndex: 50,
  })

  map.add(bufferCircle)
  bufferVisible.value = true
}

function addCandidateMarkers(points) {
  // 判断当前待匹配点是否已被匹配过（重新匹配时候选点 confirmed 会重置，需以源点状态为准）
  const sourceAlreadyMatched = currentSourcePoint.value && matchStore.isPointMatched(currentSourcePoint.value)

  points.forEach((point, index) => {
    const isConfirmed = point.confirmed
    const isTop = !sourceAlreadyMatched && index === 0

    const lng = parseFloat(point[getTargetLngField()]) || 0
    const lat = parseFloat(point[getTargetLatField()]) || 0

    let markerHtml = ''
    if (isConfirmed) {
      // 已确认：绿色圆点
      markerHtml = '<div style="width:16px;height:16px;border-radius:50%;background:#00b42a;box-shadow:0 0 0 3px rgba(0,180,42,0.3);border:2px solid #fff;"></div>'
    } else if (isTop) {
      // 最佳匹配：红色圆点
      markerHtml = '<div style="width:18px;height:18px;border-radius:50%;background:#f53f3f;box-shadow:0 0 0 3px rgba(245,63,63,0.3);border:2px solid #fff;"></div>'
    } else {
      // 普通候选：橙色圆点
      markerHtml = '<div style="width:14px;height:14px;border-radius:50%;background:#ff7d00;box-shadow:0 0 0 2px rgba(255,125,0,0.3);border:2px solid #fff;"></div>'
    }

    const marker = new window.AMap.Marker({
      position: [lng, lat],
      content: markerHtml,
      offset: new window.AMap.Pixel(0, 0),
      zIndex: 80 + (isTop ? 10 : 0),
      title: point[getTargetNameField()],
      anchor: 'center',
    })

    const infoWindowContent = buildInfoWindowContent(point, index, sourceAlreadyMatched)

    marker.on('click', () => {
      if (activeInfoWindow) activeInfoWindow.close()
      const content = buildInfoWindowContent(point, index, sourceAlreadyMatched)
      activeInfoWindow = new window.AMap.InfoWindow({
        content: content,
        offset: new window.AMap.Pixel(0, -12),
      })
      activeInfoWindow.open(map, marker.getPosition())

      // InfoWindow 打开后绑定确认按钮事件
      nextTick(() => {
        const btn = document.getElementById(`confirm-btn-${index}`)
        if (btn) {
          btn.onclick = () => {
            // 检查是否已有其他确认的候选点
            const hasConfirmedOther = candidatePoints.value.some(c => c.confirmed && c.id !== point.id)
            if (hasConfirmedOther) {
              ElMessage.warning('请先点击顶部的"撤回匹配"，再进行勾选切换')
              return
            }
            matchStore.confirmMatch(point)
          }
        }
      })
    })

    candidateMarkers.push(marker)
  })

  map.add(candidateMarkers)
}

function buildInfoWindowContent(point, index, sourceAlreadyMatched = false) {
  const scoreColor = point.score >= 0.7 ? '#00b42a' : point.score >= 0.5 ? '#1677ff' : '#ff7d00'
  const distColor = point.distance <= 100 ? '#00b42a' : point.distance <= 300 ? '#1677ff' : '#ff7d00'

  const confirmBtnId = `confirm-btn-${index}`

  const isTop = !sourceAlreadyMatched && index === 0

  return `
    <div style="padding:12px;min-width:220px;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        ${isTop ? '<span style="background:#f53f3f;color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;">最佳匹配</span>' : ''}
        ${point.confirmed ? '<span style="background:#00b42a;color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;">已确认</span>' : ''}
        <span style="font-weight:600;font-size:14px;color:#1d2129;">${point[getTargetNameField()] || ''}</span>
      </div>
      <div style="font-size:12px;color:#4e5969;margin-bottom:4px;">地址：${point[getTargetAddrField()] || ''}</div>
      <div style="font-size:12px;color:#4e5969;margin-bottom:4px;">${getTargetUvField()}：${point[getTargetUvField()] || ''}</div>
      <div style="display:flex;gap:12px;margin-bottom:8px;">
        <span style="font-size:12px;color:${distColor};font-weight:500;">距离：${point.distance ? point.distance.toFixed(1) + ' m' : '-'}</span>
        <span style="font-size:12px;color:${scoreColor};font-weight:500;">得分：${point.score !== undefined ? (point.score * 100).toFixed(0) : '-'}</span>
      </div>
      <button id="${confirmBtnId}" style="width:100%;height:30px;background:#1677ff;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
        确认匹配
      </button>
    </div>
  `
}

function clearSourceMarker() {
  if (sourceMarker) {
    map.remove(sourceMarker)
    sourceMarker = null
  }
  if (bufferCircle) {
    map.remove(bufferCircle)
    bufferCircle = null
  }
  bufferVisible.value = false
}

function clearCandidateMarkers() {
  if (candidateMarkers.length > 0) {
    map.remove(candidateMarkers)
    candidateMarkers = []
  }
  if (activeInfoWindow) {
    activeInfoWindow.close()
    activeInfoWindow = null
  }
}

function fitAllMarkers() {
  if (!map) return

  try {
    const allPoints = []

    if (currentSourcePoint.value) {
      const sLng = parseFloat(currentSourcePoint.value[getSourceLngField()]) || 0
      const sLat = parseFloat(currentSourcePoint.value[getSourceLatField()]) || 0
      if (sLng && sLat) allPoints.push([sLng, sLat])
    }

    if (candidatePoints.value && candidatePoints.value.length > 0) {
      candidatePoints.value.forEach((p) => {
        const tLng = parseFloat(p[getTargetLngField()]) || 0
        const tLat = parseFloat(p[getTargetLatField()]) || 0
        if (tLng && tLat) allPoints.push([tLng, tLat])
      })
    }

    if (allPoints.length === 0) return
    if (allPoints.length === 1) {
      map.setCenter(allPoints[0])
      map.setZoom(17)
      return
    }

    map.setFitView(null, false, [80, 80, 80, 80])
  } catch (err) {
    console.error('[fitAllMarkers] 调整地图视图失败:', err)
  }
}

function backToCurrent() {
  if (!map || !currentSourcePoint.value) return
  const lng = parseFloat(currentSourcePoint.value[getSourceLngField()]) || 0
  const lat = parseFloat(currentSourcePoint.value[getSourceLatField()]) || 0
  if (lng && lat) {
    map.setCenter([lng, lat])
    map.setZoom(16)
  }
}

function resizeMap() {
  if (map) {
    nextTick(() => {
      map.resize()
    })
  }
}

defineExpose({
  resizeMap,
})
</script>

<style scoped>
.map-panel {
  width: 100%;
  height: 100%;
  position: relative;
  background: #e8e8e8;
  overflow: hidden;
}

.map-container {
  width: 100%;
  height: 100%;
}

.legend-panel {
  position: absolute;
  top: 14px;
  left: 14px;
  background: #ffffff;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: 10;
  min-width: 120px;
}

.legend-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 10px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #4e5969;
}

.legend-item:last-of-type {
  margin-bottom: 0;
}

.legend-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-dot.source {
  background: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.2);
}

.legend-dot.best {
  background: #f53f3f;
  box-shadow: 0 0 0 2px rgba(245, 63, 63, 0.2);
}

.legend-dot.candidate {
  background: #ff7d00;
  box-shadow: 0 0 0 2px rgba(255, 125, 0, 0.2);
}

.legend-dot.matched {
  background: #00b42a;
  box-shadow: 0 0 0 2px rgba(0, 180, 42, 0.2);
}

.legend-circle {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px dashed #1677ff;
  background: rgba(22, 119, 255, 0.1);
  flex-shrink: 0;
  box-sizing: border-box;
}

.legend-text {
  font-size: 13px;
}

.map-controls {
  position: absolute;
  top: 14px;
  right: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 10;
}

.map-controls .source-info-card ~ & {
  top: 180px;
}

.map-control-btn {
  width: 36px;
  height: 36px;
  background: #ffffff;
  border: none;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #4e5969;
  font-size: 16px;
  transition: all 0.2s;
  padding: 0;
}

.map-control-btn:hover {
  color: #1677ff;
  box-shadow: 0 2px 12px rgba(22, 119, 255, 0.25);
}

.map-control-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.source-info-card {
  position: absolute;
  top: 14px;
  right: 60px;
  background: #ffffff;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: 10;
  min-width: 260px;
  max-width: 320px;
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.info-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
}

.info-close {
  cursor: pointer;
  color: #86909c;
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
}

.info-close:hover {
  color: #f53f3f;
}

.info-row {
  display: flex;
  margin-bottom: 6px;
  font-size: 12px;
  line-height: 1.5;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  color: #86909c;
  flex-shrink: 0;
}

.info-value {
  color: #1d2129;
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.info-value.is-empty {
  color: #ff7d00;
  font-weight: 500;
}

.no-coordinates-tip {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: linear-gradient(135deg, #fff7e6, #ffe7ba);
  border: 1px solid #ffc069;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(255, 125, 0, 0.15);
  z-index: 20;
  font-size: 13px;
  color: #873800;
  max-width: 80%;
}

.legend-empty {
  font-size: 13px;
  color: #86909c;
  padding: 4px 0;
}
</style>
