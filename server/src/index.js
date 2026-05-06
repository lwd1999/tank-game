import cors from 'cors'
import express from 'express'
import http from 'node:http'
import { PORT } from './config.js'
import { authRequired, mountAuthRoutes } from './modules/auth.js'
import { createRealtime } from './modules/realtime.js'
import { currentLobbyRooms, mountRoomRoutes } from './modules/rooms.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const server = http.createServer(app)
const realtime = createRealtime(server)

mountAuthRoutes(app)
mountRoomRoutes(app, authRequired, realtime.broadcastRoom, realtime.broadcastAll)

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: currentLobbyRooms().length })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: '服务器异常' })
})

server.listen(PORT, () => {
  console.log(`[tank-battle-server] listening on ${PORT}`)
})
