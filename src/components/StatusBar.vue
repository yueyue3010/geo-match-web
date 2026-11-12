<template>
  <div class="status-bar">
    <div class="status-left">
      <div class="stat-item">
        <span class="stat-label">已匹配：</span>
        <span class="stat-value matched">{{ matchedCount }}</span>
      </div>
      <span class="divider">|</span>
      <div class="stat-item">
        <span class="stat-label">未匹配：</span>
        <span class="stat-value unmatched">{{ unmatchedCount }}</span>
      </div>
    </div>
    <div class="status-right">
      <span class="version-text">
        <el-icon color="#86909c"><MagicStick /></el-icon>
        地理点位在线匹配平台
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useMatchStore } from '../stores/matchStore'
import { storeToRefs } from 'pinia'

const matchStore = useMatchStore()

const matchedCount = computed(() => {
  return matchStore.sourcePoints.filter(p => matchStore.isPointMatched(p)).length
})

const unmatchedCount = computed(() => {
  return matchStore.sourcePoints.length - matchedCount.value
})
</script>

<style scoped>
.status-bar {
  height: 36px;
  background: #ffffff;
  border-top: 1px solid #e5e6eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.stat-label {
  color: #86909c;
}

.stat-value {
  color: #1d2129;
  font-weight: 500;
}

.stat-value.matched {
  color: #00b42a;
}

.stat-value.unmatched {
  color: #f53f3f;
}

.divider {
  color: #e5e6eb;
  font-size: 12px;
}

.status-right {
  display: flex;
  align-items: center;
}

.version-text {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #86909c;
}
</style>
