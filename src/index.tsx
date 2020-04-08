import * as React from "react"
import { render } from "react-dom"
import { v4 as uuid } from "uuid"
import Cookies from "js-cookie"
import { App } from "./components/App"

const getUserId = (): string => {
    let userId = Cookies.get("user_id")
    if (!userId) {
        userId = uuid()
        Cookies.set("user_id", userId)
    }
    return userId
}

const userId = getUserId()

render(<App userId={uuid()} />, document.getElementById("root"))
