import { IS_DEMO, DEMO_DATA } from './config'

function toFile(text, name) {
  const bytes = new TextEncoder().encode(text)
  return new File([bytes], name, { type: 'text/csv' })
}

async function fetchText(relPath) {
  const base = import.meta.env.BASE_URL || '/'
  const prefix = base.endsWith('/') ? base : base + '/'
  const res = await fetch(prefix + relPath)
  if (!res.ok) throw new Error(`示例数据加载失败：${res.status}`)
  return res.text()
}

/**
 * 演示版启动流程：自动载入内置示例数据，选中第一条未匹配点并执行一次候选搜索，
 * 让访问者打开链接即可看到完整工作流，无需自行准备 CSV。
 */
export async function bootDemo(store) {
  if (!IS_DEMO) return false
  try {
    const [srcText, tgtText] = await Promise.all([
      fetchText(DEMO_DATA.source.file),
      fetchText(DEMO_DATA.target.file),
    ])
    await store.loadTargetFromLocal(toFile(tgtText, DEMO_DATA.target.name), DEMO_DATA.target.name)
    await store.loadSourceFromLocal(toFile(srcText, DEMO_DATA.source.name), DEMO_DATA.source.name)

    const first =
      store.sourcePoints.find((p) => store.isPointUnmatched(p)) || store.sourcePoints[0]
    if (first) {
      store.selectSourcePoint(first)
      store.findCandidates()
    }
    return true
  } catch (err) {
    console.error('[demo] 示例数据加载失败：', err)
    return false
  }
}
