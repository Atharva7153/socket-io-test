
const express = require('express')
const http = require('http')
const { Server } = require("socket.io")
const cors = require('cors')

const app = express()

const server = http.createServer(app)

app.use(cors())

const votes = {
    JavaScript: 0,
    Cpp: 1,
    Python: 2
}

const voters = [];
let active_users = 0;


const io = new Server(server, {
    cors: {
        origin: "*"
    }
})

io.on("connection", (socket) => {

    console.log("connected", socket.id);
    active_users++
    io.emit("active_users", active_users)


    socket.on("Vote", (data) => {

        console.log(data)

        if (voters.includes(socket.id)) {
            socket.emit("MSG", "You cant vote more than 1 time")

            return
        }

        if (data == "Python") {
            votes.Python++;
        }
        else if (data == "Cpp") {
            votes.Cpp++;
        }
        else {
            votes.JavaScript++;
        }

        voters.push(socket.id)

        io.emit("msg", votes)
    })

    socket.on("reset", ()=>{
        votes.Cpp = 0;
        votes.JavaScript = 0;
        votes.Python = 0;
        io.emit("msg", votes)
    })

    socket.on("disconnect", () => {
        active_users--;
        io.emit("active_users", active_users)
    })

})




app.get("/", (req, res) => {
    res.send("Hello")
})

app.get("/votes", (req, res) => {
    res.json(votes)
})


server.listen(3000, () => {
    console.log("Server on 3000")
})