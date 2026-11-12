export function haversineDistance(lng1, lat1, lng2, lat2) {
  const R = 6371000
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function levenshteinSimilarity(str1, str2) {
  if (!str1 || !str2) return 0
  const s1 = String(str1).toLowerCase().trim()
  const s2 = String(str2).toLowerCase().trim()
  if (s1 === s2) return 1
  if (s1.length === 0 || s2.length === 0) return 0

  const matrix = []
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2[i - 1] === s1[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  const maxLen = Math.max(s1.length, s2.length)
  return 1 - matrix[s2.length][s1.length] / maxLen
}

export function normalizeText(text) {
  if (!text) return ''
  return String(text)
    .replace(/[\s\-—–·.,，。、；;：:“”""''`~!@#$%^&*()（）【】\[\]{}《》<>/\\|]/g, '')
    .replace(/号$/, '')
    .replace(/弄$/, '')
    .replace(/路$/, '')
    .replace(/街$/, '')
    .replace(/小区$/, '')
    .replace(/花园$/, '')
    .replace(/公寓$/, '')
    .replace(/苑$/, '')
    .toLowerCase()
    .trim()
}

export function calculateSimilarity(str1, str2) {
  const n1 = normalizeText(str1)
  const n2 = normalizeText(str2)
  if (n1 === n2) return 1
  if (n1.includes(n2) || n2.includes(n1)) {
    return Math.max(0.85, levenshteinSimilarity(str1, str2))
  }
  return levenshteinSimilarity(str1, str2)
}
