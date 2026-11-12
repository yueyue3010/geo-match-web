<template>
  <div class="match-param-bar">
    <div class="param-left">
      <!-- 顶层匹配模式：综合匹配 / 地址匹配 -->
      <div class="mode-selector top-mode">
        <div
          class="mode-option"
          :class="{ active: matchParams.matchMode === 'comprehensive', disabled: !bothHaveCoordinates }"
          :title="!bothHaveCoordinates ? '当前数据没有经纬度坐标，请使用地址匹配' : ''"
          @click="switchMode('comprehensive')"
        >
          <el-icon color="#1677ff"><Aim /></el-icon>
          <span>综合匹配</span>
        </div>
        <div
          class="mode-option"
          :class="{ active: matchParams.matchMode === 'address', disabled: bothHaveCoordinates }"
          :title="bothHaveCoordinates ? '当前数据包含经纬度坐标，请使用综合匹配或经纬度匹配' : ''"
          @click="switchMode('address')"
        >
          <el-icon color="#00b42a"><MapLocation /></el-icon>
          <span>地址匹配</span>
        </div>
      </div>

      <div class="mode-separator"></div>

      <!-- 综合匹配下的子模式：单点 / 批量 / 经纬度 -->
      <template v-if="matchParams.matchMode === 'comprehensive'">
        <div class="sub-mode-selector">
          <div
            class="sub-mode-option"
            :class="{ active: operationMode === 'single' }"
            @click="switchOperationMode('single')"
          >
            <span>单点匹配</span>
          </div>
          <div
            class="sub-mode-option"
            :class="{ active: operationMode === 'batch' }"
            @click="switchOperationMode('batch')"
          >
            <span>批量匹配</span>
          </div>
          <div
            class="sub-mode-option"
            :class="{ active: operationMode === 'location', disabled: !bothHaveCoordinates }"
            :title="!bothHaveCoordinates ? '当前数据无经纬度，无法使用' : ''"
            @click="switchOperationMode('location')"
          >
            <span>经纬度匹配</span>
          </div>
        </div>

        <div class="mode-separator"></div>

        <!-- 单点/批量匹配参数（名称阈值、地址阈值、距离限制） -->
        <template v-if="operationMode === 'single' || operationMode === 'batch'">
          <div class="param-item">
            <el-tooltip content="小区名称模糊匹配的最低得分（0-100），低于此阈值的候选点将被过滤。默认60，值越大匹配越严格" placement="top">
              <span class="param-label has-tip">名称阈值</span>
            </el-tooltip>
            <el-input-number
              v-model="nameThreshold"
              :min="0"
              :max="100"
              :step="5"
              size="default"
              class="param-input small"
              controls-position="right"
            />
          </div>

          <div class="param-item">
            <el-tooltip content="小区地址模糊匹配的最低得分（0-100），低于此阈值的候选点将被过滤。默认60，值越大匹配越严格" placement="top">
              <span class="param-label has-tip">地址阈值</span>
            </el-tooltip>
            <el-input-number
              v-model="addrThreshold"
              :min="0"
              :max="100"
              :step="5"
              size="default"
              class="param-input small"
              controls-position="right"
            />
          </div>

          <div class="param-item">
            <el-tooltip content="以待匹配点为圆心的搜索半径（米），仅搜索该范围内的候选点。即地图上的缓冲区范围" placement="top">
              <span class="param-label has-tip">距离限制(m)</span>
            </el-tooltip>
            <el-input-number
              v-model="distLimit"
              :min="50"
              :max="2000"
              :step="50"
              size="default"
              class="param-input"
              controls-position="right"
            />
          </div>
        </template>

        <!-- 经纬度匹配参数（仅距离限制） -->
        <template v-if="operationMode === 'location'">
          <div class="param-item">
            <el-tooltip content="以待匹配点为圆心的搜索半径（米），仅搜索该范围内的候选点。即地图上的缓冲区范围" placement="top">
              <span class="param-label has-tip">距离限制(m)</span>
            </el-tooltip>
            <el-input-number
              v-model="distLimit"
              :min="50"
              :max="2000"
              :step="50"
              size="default"
              class="param-input"
              controls-position="right"
            />
          </div>
        </template>
      </template>

      <!-- 地址匹配模式下的子模式：仅单点 / 批量，无距离限制 -->
      <template v-else-if="matchParams.matchMode === 'address'">
        <div class="sub-mode-selector">
          <div
            class="sub-mode-option"
            :class="{ active: operationMode === 'single' }"
            @click="switchOperationMode('single')"
          >
            <span>单点匹配</span>
          </div>
          <div
            class="sub-mode-option"
            :class="{ active: operationMode === 'batch' }"
            @click="switchOperationMode('batch')"
          >
            <span>批量匹配</span>
          </div>
        </div>

        <div class="mode-separator"></div>

        <div class="param-item">
          <el-tooltip content="小区名称模糊匹配的最低得分（0-100），低于此阈值的候选点将被过滤。默认60" placement="top">
            <span class="param-label has-tip">名称阈值</span>
          </el-tooltip>
          <el-input-number
            v-model="nameThreshold"
            :min="0"
            :max="100"
            :step="5"
            size="default"
            class="param-input small"
            controls-position="right"
          />
        </div>

        <div class="param-item">
          <el-tooltip content="小区地址模糊匹配的最低得分（0-100），低于此阈值的候选点将被过滤。默认60" placement="top">
            <span class="param-label has-tip">地址阈值</span>
          </el-tooltip>
          <el-input-number
            v-model="addrThreshold"
            :min="0"
            :max="100"
            :step="5"
            size="default"
            class="param-input small"
            controls-position="right"
          />
        </div>

        <div class="param-item addr-mode-tip">
          <el-icon color="#00b42a" :size="14"><InfoFilled /></el-icon>
          <span>无经纬度，仅文本匹配</span>
        </div>
      </template>
    </div>

    <div class="param-right">
      <template v-if="matchParams.matchMode === 'comprehensive'">
        <div class="warning-tip" v-if="operationMode === 'single'">
          <el-icon color="#ff7d00" :size="12"><Warning /></el-icon>
          <span>一次仅选1个待匹配点</span>
        </div>
        <div class="warning-tip" v-else-if="operationMode === 'batch'">
          <el-icon color="#00b42a" :size="12"><InfoFilled /></el-icon>
          <span>多选批量匹配</span>
        </div>
        <div class="warning-tip" v-else>
          <el-icon color="#1677ff" :size="12"><InfoFilled /></el-icon>
          <span>仅按经纬度距离匹配，人工判断</span>
        </div>
      </template>
      <template v-else>
        <div class="warning-tip" v-if="operationMode === 'single'">
          <el-icon color="#ff7d00" :size="12"><Warning /></el-icon>
          <span>一次仅选1个待匹配点</span>
        </div>
        <div class="warning-tip" v-else>
          <el-icon color="#00b42a" :size="12"><InfoFilled /></el-icon>
          <span>地址模式·多选批量匹配</span>
        </div>
      </template>

      <el-button
        type="primary"
        size="default"
        class="start-match-btn"
        :loading="isMatching"
        :disabled="
          (operationMode === 'single' && !currentSourcePoint) ||
          (operationMode === 'location' && !currentSourcePoint)
        "
        @click="handleStartMatch"
      >
        <el-icon><Search /></el-icon>
        <span>开始匹配</span>
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { toRefs, computed } from 'vue'
import { useMatchStore } from '../stores/matchStore'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { Aim, MapLocation, Warning, InfoFilled, Search } from '@element-plus/icons-vue'

const matchStore = useMatchStore()
const {
  isMatching,
  currentSourcePoint,
  matchOperationMode,
  matchParams,
  bothHaveCoordinates,
} = storeToRefs(matchStore)

const operationMode = matchOperationMode

const { nameThreshold, addrThreshold, distLimit } = toRefs(matchStore.matchParams)

function switchMode(mode) {
  if (mode === 'comprehensive' && !bothHaveCoordinates.value) {
    ElMessage.warning('当前导入的数据中没有经纬度坐标，无法使用综合匹配，请使用「地址匹配」')
    return
  }
  if (mode === 'address' && bothHaveCoordinates.value) {
    ElMessage.warning('当前导入的数据包含经纬度坐标，地址匹配仅适用于无坐标的纯文本表格场景，请使用「综合匹配」或「经纬度匹配」')
    return
  }
  matchParams.value.matchMode = mode
  // 切换模式后，默认回到单点模式
  if (matchOperationMode.value === 'location' && mode === 'address') {
    matchStore.matchOperationMode = 'single'
  }
}

function switchOperationMode(mode) {
  if (mode === 'location' && !bothHaveCoordinates.value) {
    ElMessage.warning('当前数据没有经纬度，无法使用经纬度匹配')
    return
  }
  matchStore.matchOperationMode = mode
}

function handleStartMatch() {
  if (matchOperationMode.value === 'single' || matchOperationMode.value === 'location') {
    if (!currentSourcePoint.value) {
      ElMessage.warning('请先选择一个待匹配点')
      return
    }
    matchStore.findCandidates()
  } else {
    matchStore.batchMatch()
  }
}
</script>

<style scoped>
.match-param-bar {
  height: 52px;
  background: #ffffff;
  border-top: 1px solid #e5e6eb;
  border-bottom: 1px solid #e5e6eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;
}

.param-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mode-selector {
  display: flex;
  background: #f2f3f5;
  border-radius: 6px;
  padding: 3px;
  gap: 3px;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  color: #4e5969;
  position: relative;
}

.mode-option.active {
  background: #ffffff;
  color: #1677ff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.mode-option.active:last-child {
  color: #00b42a;
}

.mode-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  color: #86909c !important;
}

.mode-option:hover:not(.active):not(.disabled) {
  background: #e5e6eb;
}

.sub-mode-selector {
  display: flex;
  background: #f7f8fa;
  border-radius: 4px;
  padding: 2px;
  gap: 2px;
}

.sub-mode-option {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 12px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
  color: #4e5969;
}

.sub-mode-option.active {
  background: #ffffff;
  color: #1677ff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.sub-mode-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  color: #86909c;
}

.sub-mode-option:hover:not(.active):not(.disabled) {
  background: #e5e6eb;
}

.mode-separator {
  width: 1px;
  height: 24px;
  background: #e5e6eb;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-label {
  font-size: 13px;
  color: #4e5969;
  white-space: nowrap;
}

.param-label.has-tip {
  cursor: help;
  border-bottom: 1px dashed #c9cdd4;
}

.param-input {
  width: 80px;
}

.param-input.small {
  width: 75px;
}

.addr-mode-tip {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #00b42a;
  background: #e8ffea;
  padding: 4px 10px;
  border-radius: 4px;
  line-height: 1.4;
  white-space: nowrap;
}

.param-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.warning-tip {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #ff7d00;
  background: #fff7e8;
  padding: 4px 10px;
  border-radius: 4px;
  line-height: 1.4;
  max-width: 180px;
}

.start-match-btn {
  height: 36px;
  padding: 0 24px;
  font-size: 14px;
  font-weight: 500;
  background: #1677ff;
  border: none;
  display: flex;
  align-items: center;
  gap: 6px;
}

.start-match-btn:hover {
  background: #4096ff !important;
}

.start-match-btn:disabled {
  background: #c9cdd4 !important;
  cursor: not-allowed;
}
</style>
