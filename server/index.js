import express from "express"
import logger from "morgan"
import { Server } from "socket.io"
import { createServer } from "node:http"
import dotenv from 'dotenv'
import { createClient } from "@libsql/client"

const port = process.env.PORT ?? 3000
dotenv.config()

const app = express()
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {}
})

const db = createClient({
    url: process.env.DB_URL,
    authToken: process.env.DB_TOKEN
})

await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        username TEXT
    )
`)

io.on('connection', async (socket) => {
    console.log('a user is connected!')

    socket.on('disconnect', () => {
        console.log('a user is disconnected!')
    })

    socket.on('chat message', async (msg) => {
        let result
        const username = socket.handshake.auth.username ?? 'anonymous'
        try{
            result = await db.execute({
                sql: `INSERT INTO messages (content, username) VALUES (:msg, :username)`,
                args: { msg, username }
            })
        }catch(e){
            console.error(e)
            return
        }
        io.emit('chat message', msg, result.lastInsertRowid.toString(), username)
    })

    if(!socket.recovered){
        try{
            let results = await db.execute({
                sql: `SELECT id, content, username FROM messages WHERE id > ?`,
                args: [socket.handshake.auth.serverOffset ?? 0]
            })
            results.rows.forEach(row => {
                socket.emit('chat message',row.content, row.id.toString(), row.username)
            });
        }catch(e){
            console.error(e)
            return
        }
    }
})

app.use(logger('dev'))

app.get('/', (req, res) => {
    res.sendFile(process.cwd()+'/client/index.html')
})

server.listen(port, () => {
    console.log('Server listening on port: '+port)
})