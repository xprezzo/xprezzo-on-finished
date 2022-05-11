/*!
 * xprezzo-on-finished
 * Copyright(c) 2022 Cloudgen Wong <cloudgen.wong@gmail.com>
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */
const __queue__ = new WeakMap()
const first = require('./lib/ee-first')

/**
 * Variables.
 * @private
 */

/* istanbul ignore next */
const defer = typeof setImmediate === 'function'
  ? setImmediate
  : function (fn) { process.nextTick(fn.bind.apply(fn, arguments)) }

/**
 * Determine if message is already finished.
 *
 * @param {object} msg
 * @return {boolean}
 * @public
 */
let isFinished = (msg) => {
    const socket = msg.socket

    if (typeof msg.finished === 'boolean') {
        // OutgoingMessage
        return Boolean(msg.finished || (socket && !socket.writable))
    }

    if (typeof msg.complete === 'boolean') {
        // IncomingMessage
        return Boolean(msg.upgrade || !socket || !socket.readable || (msg.complete && !msg.readable))
    }

    // don't know
    return undefined
}

/**
 * Attach a finished listener to the message.
 *
 * @param {object} msg
 * @param {function} callback
 * @private
 */

let attachFinishedListener =(msg, callback) => {
    let eeSocket
    let finished = false
    let onFinish = (error) => {
        eeMsg.cancel()
        eeSocket.cancel()

        finished = true
        callback(error)
    }

    // finished on first message event
    const eeMsg = eeSocket = first([[msg, 'end', 'finish']], onFinish)

    let onSocket = (socket) => {
        // remove listener
        msg.removeListener('socket', onSocket)

        if (finished) return
        if (eeMsg !== eeSocket) return

        // finished on first socket event
        eeSocket = first([[socket, 'error', 'close']], onFinish)
    }

    if (msg.socket) {
      // socket already assigned
      onSocket(msg.socket)
      return
    }

    // wait for socket to be assigned
    msg.on('socket', onSocket)

    if (msg.socket === undefined) {
        // to be remove soon:
        // Patch ServerResponse.prototype.assignSocket for node.js 0.8.
        // istanbul ignore next: node.js 0.8 patch
        ((res, callback) => {
            const assignSocket = res.assignSocket
    
            if (typeof assignSocket !== 'function') return
    
            // res.on('socket', callback) is broken in 0.8
            res.assignSocket = (socket) => {
                assignSocket.call(this, socket)
                callback(socket)
            }
        })(msg, onSocket)
    }
}

let asyncHooks = (() => {
    try {
      return require('async_hooks')
    } catch (e) {
        return {}
    }
})()

/**
 * Module exports.
 * @public
 */

/**
 * Invoke callback when the response has finished, useful for
 * cleaning up resources afterwards.
 *
 * @param {object} msg
 * @param {function} listener
 * @return {object}
 * @public
 */
module.exports = (msg, listener) => {
    if (isFinished(msg) !== false) {
        defer(listener, null, msg)
        return msg
    }

    // attach the listener to the message
    ((msg, listener) => {
        let attached = msg.__onFinishe
        let res

        // create anonymous resource
        if (asyncHooks.AsyncResource) {
            res = new asyncHooks.AsyncResource(listener.name || 'bound-anonymous-fn')
        }

        // apply to compatible node.js on 
        if (res && res.runInAsyncScope) {
            listener = res.runInAsyncScope.bind(res, listener, null)
        }
        // create a private single listener with queue
        if (!attached || !attached.queue) {
            // Create listener on message
            attached = msg.__onFinished = ((msg) =>{
                let listener = (err) => {
                    const queue = __queue__.get(listener)
                    if (msg.__onFinished === listener) msg.__onFinished = null
                    if (!queue) return
      
                    __queue__.set(listener, null)
                    for (let i = 0; i < queue.length; i++) {
                        queue[i](err, msg)
                    }
                }
                __queue__.set(listener, [])
                return listener
            })(msg)
            attachFinishedListener(msg, attached)
        }
        const queue = __queue__.get(attached)
        queue.push(listener)
        __queue__.set(attached, queue)
    })(msg, listener)

    return msg
}

module.exports.isFinished = isFinished
