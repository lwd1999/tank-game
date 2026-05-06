import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { JWT_SECRET } from '../config.js'
import { addUser, getUsers } from '../db/store.js'

function createToken(user) {
  return jwt.sign({ uid: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' })
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ error: '未登录' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = { id: payload.uid, username: payload.username }
    next()
  } catch {
    res.status(401).json({ error: '登录已失效' })
  }
}

export function mountAuthRoutes(app) {
  app.post('/auth/register', async (req, res) => {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    if (!username || !password || username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: '账号至少3位，密码至少6位' })
    }
    const users = getUsers()
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: '账号已存在' })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const user = { id: uuidv4(), username, passwordHash, createdAt: Date.now() }
    addUser(user)
    const token = createToken(user)
    res.json({ token, user: { id: user.id, username: user.username } })
  })

  app.post('/auth/login', async (req, res) => {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    const users = getUsers()
    const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase())
    if (!user) return res.status(401).json({ error: '账号或密码错误' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: '账号或密码错误' })
    const token = createToken(user)
    res.json({ token, user: { id: user.id, username: user.username } })
  })

  app.post('/auth/logout', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/auth/me', authRequired, (req, res) => {
    res.json({ user: req.user })
  })
}
