import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import axios from "axios"

const socket = io("http://localhost:3000");

const Vote = (data) => {

    socket.emit("Vote", data)
}

function App() {

    const [msg, setMsg] = useState("");
    const [votes, setVotes] = useState({})
    const [users, setUsers] = useState()

    const Reset = ()=>{
        socket.emit("reset")
    }

    useEffect(() => {

        const getVotes = async () => {

            const response = await axios.get("http://localhost:3000/votes")
            setVotes(response.data)

        }

        getVotes()

        socket.on("msg", (data) => {
            setVotes(data);
        });

        socket.on("active_users", (data)=>{

            setUsers(data)

        })

        socket.on("MSG", (data)=>{
            setMsg(data)
        })


    }, []);

    console.log(votes)

    const totalVotes = Object.values(votes).reduce((acc, val) => acc + val, 0);


    return (
        <>
            <h1>Hello</h1>
            <div>
                {Object.entries(votes).map(([language, vote]) => (
                    <div>
                        <h1 key={language}>
                            {language}: {vote}
                        </h1>
                        <progress value={vote} max={totalVotes > 0 ? totalVotes : 1} />
                        <button onClick={() => Vote(language)}>Vote</button>
                    </div>

                ))}
            </div>
            <h1>{msg}</h1>

            <h5>{users} Online</h5>

            <button onClick={()=>Reset()}>RESET VOTES</button>

            
        </>
    )
}

export default App;