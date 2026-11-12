// 演示模式配置
// 说明：演示版为纯前端静态站点，不依赖 Node 后端与 MongoDB，
// 匹配算法（smartMatch.js）完全在浏览器端运行。
export const IS_DEMO = true

export const DEMO_DATA = {
  source: {
    file: 'demo-data/source_unmatched.csv',
    name: '待匹配点_示例.csv',
  },
  target: {
    file: 'demo-data/target_candidates.csv',
    name: '候选点_示例.csv',
  },
}
