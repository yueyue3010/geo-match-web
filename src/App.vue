<template>
  <div class="app-container">
    <HeaderToolbar />

    <transition name="slide-down">
      <div v-if="hasUnsavedChanges" class="unsaved-banner">
        <el-icon :size="14" color="#ff7d00"><WarningFilled /></el-icon>
        <span>当前匹配结果尚未保存,点击顶部"保存结果"可将结果保存到新建副本</span>
        <button class="close-banner" @click="closeBanner" title="关闭提示">
          <el-icon :size="14" color="#d46b08"><Close /></el-icon>
        </button>
      </div>
    </transition>

    <div class="main-content">
      <div class="map-section" :style="{ height: mapHeight + 'px' }">
        <MapPanel ref="mapPanelRef" />
      </div>

      <div class="resize-handle" @mousedown="startResize">
        <div class="resize-icon">
          <el-icon><Rank /></el-icon>
        </div>
      </div>

      <div class="bottom-section" :style="{ height: bottomHeight + 'px' }">
        <MatchParamBar />

        <div class="tables-section">
          <div class="table-left" :style="{ width: leftWidth + '%' }">
            <SourcePointTable ref="sourceTableRef" />
          </div>
          <div class="horizontal-resize-handle" @mousedown="startHorizontalResize">
            <div class="horizontal-resize-icon">
              <el-icon><Rank /></el-icon>
            </div>
          </div>
          <div class="table-right" :style="{ width: (100 - leftWidth) + '%' }">
            <CandidatePointTable ref="candidateTableRef" />
          </div>
        </div>
      </div>
    </div>

    <StatusBar />

    <ConfirmMatchDialog />
    <UndoMatchDialog />
    <BatchMatchDialog />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import HeaderToolbar from './components/HeaderToolbar.vue'
import MapPanel from './components/MapPanel.vue'
import MatchParamBar from './components/MatchParamBar.vue'
import SourcePointTable from './components/SourcePointTable.vue'
import CandidatePointTable from './components/CandidatePointTable.vue'
import StatusBar from './components/StatusBar.vue'
import ConfirmMatchDialog from './components/ConfirmMatchDialog.vue'
import UndoMatchDialog from './components/UndoMatchDialog.vue'
import BatchMatchDialog from './components/BatchMatchDialog.vue'
import { useMatchStore } from './stores/matchStore'
import { IS_DEMO } from './demo/config'
import { bootDemo } from './demo/autoLoad'

const matchStore = useMatchStore()
const { hasUnsavedChanges } = storeToRefs(matchStore)

const mapPanelRef = ref(null)
const sourceTableRef = ref(null)
const candidateTableRef = ref(null)
const mapHeight = ref(480)
const bottomHeight = ref(420)
const leftWidth = ref(45)
const isResizing = ref(false)
const startY = ref(0)
const startMapHeight = ref(0)
const isHorizontalResizing = ref(false)
const startX = ref(0)
const startLeftWidth = ref(0)

function refreshTableLayouts() {
  nextTick(() => {
    sourceTableRef.value?.doLayout?.()
    candidateTableRef.value?.doLayout?.()
  })
}

function closeBanner() {
  matchStore.hasUnsavedChanges = false
}

function startResize(e) {
  isResizing.value = true
  startY.value = e.clientY
  startMapHeight.value = mapHeight.value
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

function onResize(e) {
  if (!isResizing.value) return
  const deltaY = e.clientY - startY.value
  let newMapHeight = startMapHeight.value + deltaY
  const minMapHeight = 200
  const minBottomHeight = 300
  const maxMapHeight = window.innerHeight - 56 - 28 - minBottomHeight
  if (newMapHeight < minMapHeight) newMapHeight = minMapHeight
  if (newMapHeight > maxMapHeight) newMapHeight = maxMapHeight
  mapHeight.value = newMapHeight
  const totalBottom = window.innerHeight - 56 - 28 - newMapHeight
  bottomHeight.value = Math.max(minBottomHeight, totalBottom)
  nextTick(() => {
    if (mapPanelRef.value && mapPanelRef.value.resizeMap) {
      mapPanelRef.value.resizeMap()
    }
    refreshTableLayouts()
  })
}

function stopResize() {
  isResizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  refreshTableLayouts()
}

function startHorizontalResize(e) {
  isHorizontalResizing.value = true
  startX.value = e.clientX
  startLeftWidth.value = leftWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onHorizontalResize)
  document.addEventListener('mouseup', stopHorizontalResize)
}

function onHorizontalResize(e) {
  if (!isHorizontalResizing.value) return
  const deltaX = e.clientX - startX.value
  const totalWidth = window.innerWidth - 28
  let newLeftWidth = startLeftWidth.value + (deltaX / totalWidth * 100)
  if (newLeftWidth < 20) newLeftWidth = 20
  if (newLeftWidth > 70) newLeftWidth = 70
  leftWidth.value = Math.round(newLeftWidth)
}

function stopHorizontalResize() {
  isHorizontalResizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onHorizontalResize)
  document.removeEventListener('mouseup', stopHorizontalResize)
  refreshTableLayouts()
}

onMounted(() => {
  const total = window.innerHeight - 56 - 28
  mapHeight.value = Math.round(total * 0.55)
  bottomHeight.value = Math.round(total * 0.45)
  window.addEventListener('resize', handleWindowResize)
  // 初次挂载后刷新表格布局（fixed 列生效）
  refreshTableLayouts()

  // 演示版：自动载入内置示例数据
  if (IS_DEMO) {
    bootDemo(matchStore).then(() => refreshTableLayouts())
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
})

function handleWindowResize() {
  const total = window.innerHeight - 56 - 28
  const ratio = mapHeight.value / (mapHeight.value + bottomHeight.value)
  mapHeight.value = Math.round(total * ratio)
  bottomHeight.value = total - mapHeight.value
  nextTick(() => {
    if (mapPanelRef.value && mapPanelRef.value.resizeMap) {
      mapPanelRef.value.resizeMap()
    }
    refreshTableLayouts()
  })
}
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100vh;
  min-width: 1280px;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
  overflow: hidden;
}

.unsaved-banner {
  height: 32px;
  background: #fff7e8;
  border-bottom: 1px solid #ffd591;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  font-size: 12px;
  color: #d46b08;
  flex-shrink: 0;
}

.unsaved-banner span {
  font-weight: 400;
}

.close-banner {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.close-banner:hover {
  background: rgba(212, 107, 8, 0.1);
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s ease;
}
.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-100%);
  height: 0;
}
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-100%);
  height: 0;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.map-section {
  flex-shrink: 0;
  position: relative;
  background: #e8e8e8;
  overflow: hidden;
}

.resize-handle {
  height: 6px;
  background: #e5e6eb;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 100;
  transition: background 0.2s;
  flex-shrink: 0;
}

.resize-handle:hover {
  background: #c9cdd4;
}

.resize-icon {
  color: #86909c;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bottom-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tables-section {
  flex: 1;
  display: flex;
  padding: 10px 14px;
  background: #f5f7fa;
  box-sizing: border-box;
  overflow: hidden;
  min-height: 0;
}

.table-left {
  flex-shrink: 0;
  min-width: 0;
  height: 100%;
  transition: width 0.1s ease;
}

.horizontal-resize-handle {
  width: 6px;
  background: #e5e6eb;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 100;
  transition: background 0.2s;
  flex-shrink: 0;
}

.horizontal-resize-handle:hover {
  background: #c9cdd4;
}

.horizontal-resize-icon {
  color: #86909c;
  font-size: 14px;
  transform: rotate(90deg);
}

.table-right {
  flex-shrink: 0;
  min-width: 0;
  height: 100%;
  transition: width 0.1s ease;
}
</style>
