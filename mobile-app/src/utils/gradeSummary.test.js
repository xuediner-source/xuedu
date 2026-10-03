import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPassedGrade, summarizeGrades } from './gradeSummary.js'

test('passed grades include numeric scores and written passes, and exclude retakes', () => {
  assert.equal(isPassedGrade('85'), true)
  assert.equal(isPassedGrade('59.5'), false)
  assert.equal(isPassedGrade('优秀'), true)
  assert.equal(isPassedGrade('及格'), true)
  assert.equal(isPassedGrade('不及格'), false)
  assert.equal(isPassedGrade('缓考'), false)
  assert.equal(isPassedGrade(''), false)
})

test('earned credits ignore failed and retaken rows and do not invent a credit', () => {
  const summary = summarizeGrades([
    { courseName: '高数', score: '80', credit: '4', gpa: '3.0', courseNature: '必修' },
    { courseName: '高数重修', score: '50', credit: '4', gpa: '0', courseNature: '必修' },
    { courseName: '体育', score: '优秀', credit: '1', gpa: '4.0', courseNature: '必修' },
    { courseName: '讲座', score: '90', credit: '', gpa: '4.0', courseNature: '选修' }
  ])
  assert.equal(summary.total, 4)
  assert.equal(summary.passed, 3)
  assert.equal(summary.credits, 5)
  assert.equal(summary.gpa, (3 * 4 + 4 * 1) / 5)
  assert.equal(summary.byNature.length, 1)
  assert.equal(summary.byNature[0].credits, 5)
})
