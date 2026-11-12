<template>
  <div class="fallback-map">
    <div class="fm-banner">
      <span class="fm-chip">离线示意视图</span>
      <span class="fm-text">
        在线底图未加载，点位按经纬度相对位置绘制，缓冲区半径按比例还原（鼠标悬停查看属性）
      </span>
    </div>

    <div v-if="!hasPoints" class="fm-empty">
      <div class="fm-empty-title">暂无可绘制点位</div>
      <div class="fm-empty-desc">请在左侧表格中勾选一个待匹配点，或调整匹配参数后重新匹配</div>
    </div>

    <svg
      v-else
      class="fm-svg"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="xMidYMid meet"
      @mouseleave="hovered = null"
    >
      <!-- 背景网格 -->
      <g class="fm-grid">
        <line v-for="g in gridLines.x" :key="'x' + g" :x1="g" :y1="0" :x2="g" :y2="H" />
        <line v-for="g in gridLines.y" :key="'y' + g" :x1="0" :y1="g" :x2="W" :y2="g" />
      </g>

      <!-- 缓冲区 -->
      <ellipse
        v-if="source"
        :cx="source.x"
        :cy="source.y"
        :rx="buffer.rx"
        :ry="buffer.ry"
        fill="rgba(22,119,255,0.08)"
        stroke="#1677ff"
        stroke-width="2"
        stroke-dasharray="8 6"
      />
      <text v-if="source" :x="source.x + 8" :y="source.y - buffer.ry - 8" class="fm-buffer-label">
        缓冲区 {{ bufferRadius }} m
      </text>

      <!-- 候选点 -->
      <g v-for="(p, i) in candidates" :key="'c' + i">
        <circle
          :cx="p.x"
          :cy="p.y"
          :r="p.isBest ? 9 : 7"
          :fill="p.fill"
          stroke="#fff"
          stroke-width="2"
          class="fm-dot"
          @mouseenter="onHover(p, $event)"
        />
        <text v-if="p.isBest" :x="p.x" :y="p.y - 16" class="fm-best-label">最佳</text>
      </g>

      <!-- 待匹配点 -->
      <g v-if="source">
        <circle :cx="source.x" :cy="source.y" r="10" fill="#1677ff" stroke="#fff" stroke-width="2" />
        <circle :cx="source.x" :cy="source.y" r="18" fill="none" stroke="rgba(22,119,255,0.45)" stroke-width="2" />
        <text :x="source.x" :y="source.y + 32" class="fm-src-label">待匹配点</text>
      </g>

      <!-- 比例尺 -->
      <g class="fm-scale">
        <line :x1="30" :y1="H - 26" :x2="30 + scaleLen" :y2="H - 26" />
        <line :x1="30" :y1="H - 31" :x2="30" :y2="H - 21" />
        <line :x1="30 + scaleLen" :y1="H - 31" :x2="30 + scaleLen" :y2="H - 21" />
        <text :x="30" :y="H - 34">200 m</text>
      </g>
    </svg>

    <div
      v-if="hovered"
      class="fm-tooltip"
      :style="{ left: hovered.sx + 'px', top: hovered.sy + 'px' }"
    >
      <div class="fm-tt-name">{{ hovered.name || '（无名称）' }}</div>
      <div class="fm-tt-row">地址：{{ hovered.addr || '—' }}</div>
      <div class="fm-tt-row" v-if="hovered.distance != null">距离：{{ Math.round(hovered.distance) }} m</div>
      <div class="fm-tt-row" v-if="hovered.totalScore != null">综合得分：{{ hovered.totalScore }}</div>
      <div class="fm-tt-row" v-if="hovered.conflict">冲突：{{ hovered.conflict }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useMatchStore } from '../stores/matchStore'

const matchStore = useMatchStore()

const W = 1000
const H = 560
const PAD = 70
const hovered = ref(null)

function onHover(point, event) {
  const host = event.currentTarget?.ownerSVGElement?.parentElement
  const rect = host?.getBoundingClientRect()
  hovered.value = {
    ...point,
    sx: rect ? event.clientX - rect.left : 0,
    sy: rect ? event.clientY - rect.top : 0,
  }
}

function toNum(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

const bufferRadius = computed(() => Number(matchStore.matchParams?.distLimit) || 300)
const hasPoints = computed(() => Boolean(source.value) || candidates.value.length > 0)

const rawPoints = computed(() => {
  const list = []
  const sp = matchStore.currentSourcePoint
  if (sp) {
    const lng = toNum(sp[matchStore.getSourceLngField()])
    const lat = toNum(sp[matchStore.getSourceLatField()])
    if (lng && lat) {
      list.push({
        kind: 'source',
        lng,
        lat,
        name: sp[matchStore.getSourceNameField()],
        addr: sp[matchStore.getSourceAddrField()],
      })
    }
  }
  const sourceMatched =
    sp && typeof matchStore.isPointMatched === 'function' && matchStore.isPointMatched(sp)

  ;(matchStore.candidatePoints || []).forEach((c, i) => {
    const lng = toNum(c[matchStore.getTargetLngField()])
    const lat = toNum(c[matchStore.getTargetLatField()])
    if (!lng || !lat) return
    list.push({
      kind: 'candidate',
      lng,
      lat,
      index: i,
      name: c[matchStore.getTargetNameField()],
      addr: c[matchStore.getTargetAddrField()],
      distance: c.distance,
      totalScore: c.totalScore != null ? c.totalScore : c.score != null ? Math.round(c.score * 100) : null,
      conflict: c.conflict,
      confirmed: Boolean(c.confirmed),
      isBest: !sourceMatched && i === 0,
    })
  })
  return list
})

const view = computed(() => {
  const pts = rawPoints.value
  if (pts.length === 0) return null

  const lngs = pts.map((p) => p.lng)
  const lats = pts.map((p) => p.lat)
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2

  // 缓冲区半径换算成经纬度跨度，保证圆不会被裁掉
  const dLat = bufferRadius.value / 111000
  const dLng = bufferRadius.value / (111000 * Math.cos((midLat * Math.PI) / 180))

  let spanLng = Math.max(Math.max(...lngs) - Math.min(...lngs), dLng * 2) * 1.35
  let spanLat = Math.max(Math.max(...lats) - Math.min(...lats), dLat * 2) * 1.35
  spanLng = Math.max(spanLng, 0.004)
  spanLat = Math.max(spanLat, 0.004)

  const pxPerDeg = Math.min((W - PAD * 2) / spanLng, (H - PAD * 2) / spanLat)

  const project = (lng, lat) => ({
    x: W / 2 + (lng - midLng) * pxPerDeg,
    y: H / 2 - (lat - midLat) * pxPerDeg,
  })

  return { pxPerDeg, midLat, project }
})

const source = computed(() => {
  if (!view.value) return null
  const sp = rawPoints.value.find((p) => p.kind === 'source')
  if (!sp) return null
  const { x, y } = view.value.project(sp.lng, sp.lat)
  return { ...sp, x, y }
})

const candidates = computed(() => {
  if (!view.value) return []
  return rawPoints.value
    .filter((p) => p.kind === 'candidate')
    .map((p) => {
      const { x, y } = view.value.project(p.lng, p.lat)
      let fill = '#ff7d00'
      if (p.confirmed) fill = '#00b42a'
      else if (p.isBest) fill = '#f53f3f'
      return { ...p, x, y, fill }
    })
})

const buffer = computed(() => {
  if (!view.value || !source.value) return { rx: 0, ry: 0 }
  const lat = source.value.lat
  const rx = (bufferRadius.value * view.value.pxPerDeg) / (111320 * Math.cos((lat * Math.PI) / 180))
  const ry = (bufferRadius.value * view.value.pxPerDeg) / 110540
  return { rx, ry }
})

const gridLines = computed(() => {
  const step = 60
  const xs = []
  const ys = []
  for (let x = step; x < W; x += step) xs.push(x)
  for (let y = step; y < H; y += step) ys.push(y)
  return { x: xs, y: ys }
})

const scaleLen = computed(() => {
  if (!view.value) return 60
  return Math.min((200 * view.value.pxPerDeg) / 111000, 220)
})
</script>

<style scoped>
.fallback-map {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #f7f9fc 0%, #eef2f7 100%);
  overflow: hidden;
}

.fm-banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e5e6eb;
  border-radius: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  z-index: 5;
}

.fm-chip {
  font-size: 12px;
  font-weight: 600;
  color: #1677ff;
  background: rgba(22, 119, 255, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.fm-text {
  font-size: 12px;
  color: #4e5969;
}

.fm-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.fm-grid line {
  stroke: #dfe5ec;
  stroke-width: 1;
}

.fm-dot {
  cursor: pointer;
  transition: r 0.15s ease;
}

.fm-src-label,
.fm-best-label,
.fm-buffer-label {
  font-size: 12px;
  fill: #4e5969;
  text-anchor: middle;
}

.fm-best-label {
  fill: #f53f3f;
  font-weight: 600;
}

.fm-buffer-label {
  fill: #1677ff;
  text-anchor: start;
}

.fm-scale line {
  stroke: #86909c;
  stroke-width: 2;
}

.fm-scale text {
  font-size: 11px;
  fill: #86909c;
}

.fm-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #86909c;
}

.fm-empty-title {
  font-size: 14px;
  color: #4e5969;
}

.fm-empty-desc {
  font-size: 12px;
}

.fm-tooltip {
  position: absolute;
  transform: translate(14px, -50%);
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  padding: 10px 12px;
  pointer-events: none;
  z-index: 20;
  max-width: 260px;
}

.fm-tt-name {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 4px;
}

.fm-tt-row {
  font-size: 12px;
  color: #4e5969;
  line-height: 1.6;
}
</style>
