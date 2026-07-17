import { describe, expect, it } from 'vitest'

describe('test setup', () => {
  it('provides a quiet canvas 2d context in jsdom', () => {
    const context = document.createElement('canvas').getContext('2d')

    expect(context).toBeTruthy()
  })
})
