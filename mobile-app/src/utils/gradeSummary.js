const FAIL_TEXT = /不及格|不合格|补考|重修|缓考|旷考|缺考|未通过|取消/
const PASS_TEXT = /优秀|良好|中等|及格|合格|通过/

export function isPassedGrade(score) {
  const text = String(score ?? '').trim()
  if (!text) return false
  if (FAIL_TEXT.test(text)) return false
  if (/^[\d.]+$/.test(text)) {
    const value = Number(text)
    return Number.isFinite(value) && value >= 60
  }
  return PASS_TEXT.test(text)
}

export function summarizeGrades(grades) {
  const rows = Array.isArray(grades) ? grades : []
  let credits = 0
  let sum = 0
  let count = 0
  let passed = 0
  let gpaWeight = 0
  let gpaCredits = 0
  const byNature = new Map()

  rows.forEach(grade => {
    const ok = isPassedGrade(grade?.score)
    if (ok) passed += 1
    const credit = Number.parseFloat(grade?.credit)
    const earned = ok && Number.isFinite(credit) ? credit : 0
    credits += earned
    const text = String(grade?.score ?? '').trim()
    const score = Number(text)
    if (/^[\d.]+$/.test(text) && Number.isFinite(score)) {
      sum += score
      count += 1
    }
    const gpa = Number.parseFloat(grade?.gpa)
    if (ok && Number.isFinite(gpa) && earned > 0) {
      gpaWeight += gpa * earned
      gpaCredits += earned
    }
    if (earned > 0) {
      const name = String(grade?.courseNature || grade?.courseAttr || '未分类').trim() || '未分类'
      const current = byNature.get(name) || { name, credits: 0, count: 0 }
      current.credits += earned
      current.count += 1
      byNature.set(name, current)
    }
  })

  return {
    total: rows.length,
    passed,
    credits,
    average: count ? sum / count : null,
    gpa: gpaCredits ? gpaWeight / gpaCredits : null,
    byNature: [...byNature.values()].sort((a, b) => b.credits - a.credits)
  }
}
