import Peer from "simple-peer"
import PubNub from "pubnub"

const READY_MESSAGE = "ready"

let pubnub: PubNub
const messageHandlers: Map<
    string,
    (message: any) => Promise<void> | void
> = new Map()
const joinHandlers: Map<string, () => Promise<void> | void> = new Map()

let prevLocalId: string
const setupPubNub = (uuid: string) => {
    if (prevLocalId && prevLocalId !== uuid) {
        throw new Error("Cannot change local IDs.")
    }
    if (pubnub) {
        return
    }
    pubnub = new PubNub({
        publishKey: process.env.PUBNUB_PUB_KEY,
        subscribeKey: process.env.PUBNUB_SUB_KEY!,
        uuid,
    })
    console.log("adding global pubnub listener")
    pubnub.addListener({
        presence: ({ channel, action }) => {
            // console.log(channel, joinHandlers.has(channel))
            if (action === "join" && joinHandlers.has(channel)) {
                joinHandlers.get(channel)!()
            }
        },
        message: ({ channel, message }) => {
            // console.log(channel, messageHandlers.has(channel))
            if (messageHandlers.has(channel)) {
                messageHandlers.get(channel)!(message)
            }
        },
    })
}

export interface Connection {
    rtcConnection: RTCPeerConnection
    peer: Peer.Instance
}

interface Connections {
    byPeer: Map<string, Connection>
}

const connections: Connections = {
    byPeer: new Map(),
}

enum RoomMessageType {
    NONE = "none",
    JOIN = "join",
    PEERS = "peers",
}
interface RoomMessage {
    type: RoomMessageType
    sender: string
    peerIds?: string[]
}
export const joinRoom = (
    localId: string,
    roomId: string,
    setPeerIds: (peerIds: string[]) => void,
    gerPeerIds: () => string[]
) => {
    setupPubNub(localId)
    const sendMessage = (message: any) => {
        pubnub.publish({
            channel: roomId,
            message: JSON.stringify(message),
        })
    }
    // Start answering all joins with a room list
    pubnub.subscribe({
        channels: [roomId],
    })
    messageHandlers.set(roomId, (message) => {
        let data: RoomMessage = { type: RoomMessageType.NONE, sender: "nobody" }
        try {
            data = JSON.parse(message)
        } catch (e) {}
        if (data.type === RoomMessageType.NONE || data.sender === localId) {
            return
        }
        if (data.type === RoomMessageType.JOIN) {
            sendMessage({
                type: RoomMessageType.PEERS,
                sender: localId,
                peerIds: gerPeerIds(),
            })
        } else if (data.type === RoomMessageType.PEERS) {
            setPeerIds(data.peerIds!)
        }
    })
    sendMessage({ type: RoomMessageType.JOIN, sender: localId })
    return () => {
        pubnub.unsubscribe({ channels: [roomId] })
        messageHandlers.delete(roomId)
    }
}

export const connectToPeer = (
    localId: string,
    peerId: string,
    initiator: boolean,
    onClose: () => void
): Promise<Connection> => {
    const existingConnection = connections.byPeer.get(peerId)
    if (existingConnection) {
        console.log(`using existing connection for ${peerId}`)
        return Promise.resolve(existingConnection)
    }
    setupPubNub(localId)
    console.log(`connecting to ${peerId}...`, initiator)

    const receiveChannel = `${peerId}:${localId}`
    const sendChannel = `${localId}:${peerId}`
    const sendMessage = (message: any) => {
        pubnub.publish({
            channel: sendChannel,
            message,
        })
    }
    // Wait for this peer to become available, then make an offer
    pubnub.subscribe({
        channels: [receiveChannel, sendChannel],
        withPresence: true,
    })
    return new Promise((resolve) => {
        let peer: Peer.Instance | null = null
        const setupPeer = () => {
            peer = new Peer({
                initiator,
            })
            peer.on("signal", (data) => {
                sendMessage(data)
            })
            const onDisconnect = (error?: Error) => {
                console.log("DISCONNECTING")
                connections.byPeer.delete(peerId)
                onClose()
                pubnub.unsubscribeAll()
                if (error) {
                    throw error
                }
            }
            peer.on("close", onDisconnect)
            peer.on("error", (e) => {
                console.error(`rtc error for peer ${peerId}`, e)
                onDisconnect()
            })
            peer.once("connect", () => {
                console.log(`connected to ${peerId}`)
                // @ts-ignore
                const rtcConnection = peer._pc as RTCPeerConnection
                const connection = {
                    rtcConnection,
                    peer: peer!,
                }
                connections.byPeer.set(peerId, connection)
                resolve(connection)
            })
        }
        console.log(`listen on ${receiveChannel}`)
        messageHandlers.set(receiveChannel, (data) => {
            if (data === READY_MESSAGE && !initiator) {
                console.log(`preparing to receive offer from ${peerId}`)
                sendMessage(READY_MESSAGE)
            } else if (data === READY_MESSAGE && initiator) {
                console.log(`${peerId} is ready, making offer`)
                setupPeer()
            } else {
                if (!peer) {
                    setupPeer()
                }
                peer!.signal(data)
            }
        })
        sendMessage(READY_MESSAGE)
    })
}
