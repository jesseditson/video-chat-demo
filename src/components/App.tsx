import React, { FunctionComponent, useState, useEffect } from "react"
import { VideoChat } from "./VideoChat"
import { v4 as uuid } from "uuid"
import "./app.scss"
import { joinRoom } from "../lib/rtc-connections"

interface AppProps {
    userId: string
}

const ROOM_MATCH = /\/room\/([\w-]+)/i

export const App: FunctionComponent<AppProps> = ({ userId }) => {
    const [roomInputVal, setRoomInputVal] = useState<string>(uuid())
    const [currentRoom, setCurrentRoom] = useState<string | null>(null)
    const [peerIds, setPeerIds] = useState<string[]>([])
    useEffect(() => {
        if (currentRoom) {
            console.log(`joining room: ${currentRoom}`)
            joinRoom(
                userId,
                currentRoom,
                (peerIds) => setPeerIds(peerIds.filter((p) => p !== userId)),
                () => peerIds.concat(userId)
            )
        }
    }, [currentRoom])
    useEffect(() => {
        const roomMatch = window.location.pathname.match(ROOM_MATCH)
        if (roomMatch) {
            const roomId = roomMatch[1]
            setCurrentRoom(roomId)
        } else {
            setPeerIds([])
        }
    }, [window.location.href])
    const initiatorMap: Map<string, boolean> = new Map()
    if (currentRoom) {
        peerIds.forEach((peerId) => {
            console.log(peerId)
            if (peerId !== userId) {
                // This assumes the same comparison always produces the same result. It does.
                initiatorMap.set(peerId, userId < peerId)
            }
        })
    }
    return (
        <div id="app">
            <nav className="header">
                <h1>{currentRoom ? currentRoom : "Video Chat"}</h1>
            </nav>
            <section className="content">
                {!currentRoom && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault()
                            console.log(roomInputVal)
                            window.history.pushState(
                                {},
                                roomInputVal,
                                `/room/${roomInputVal}`
                            )
                            setCurrentRoom(roomInputVal)
                        }}
                    >
                        <fieldset>
                            <legend>Create or join a room</legend>
                            <input
                                type="text"
                                value={roomInputVal}
                                onChange={(e) =>
                                    setRoomInputVal(
                                        e.target.value.replace(/[^\w-]/g, "")
                                    )
                                }
                            />
                            <button type="submit">Go</button>
                        </fieldset>
                    </form>
                )}
                {currentRoom && (
                    <VideoChat
                        showLocal={true}
                        userId={userId}
                        peerIds={peerIds}
                        initiatorMap={initiatorMap}
                    />
                )}
            </section>
        </div>
    )
}
