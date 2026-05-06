import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../../data')
const dbPath = path.join(dataDir, 'db.json')

function ensureDb() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ users: [] }, null, 2), 'utf8')
  }
}

function readDb() {
  ensureDb()
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'))
  } catch {
    return { users: [] }
  }
}

function writeDb(data) {
  ensureDb()
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8')
}

export function getUsers() {
  const db = readDb()
  return Array.isArray(db.users) ? db.users : []
}

export function addUser(user) {
  const db = readDb()
  const users = Array.isArray(db.users) ? db.users : []
  users.push(user)
  db.users = users
  writeDb(db)
}
