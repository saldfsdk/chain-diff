import fs from 'node:fs'

fs.rmSync(
  'dist',
  {
    recursive: true,
    force: true,
  }
)

console.log('Cleaned dist.')
