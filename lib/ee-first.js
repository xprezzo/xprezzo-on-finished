'use strict'

/**
 * Module exports.
 * Get the first event in a set of event emitters and event pairs.
 *
 * @param {array} stuff
 * @param {function} done
 * @public
 */

module.exports = (stuff, done) => {
  if (!Array.isArray(stuff)) {
    /* istanbul ignore next */
    throw new TypeError('arg must be an array of [ee, events...] arrays')
  }
  const cleanups = []
  for (let i = 0; i < stuff.length; i++) {
    const arr = stuff[i]

    if (!Array.isArray(arr) || arr.length < 2) {
      /* istanbul ignore next */
      throw new TypeError('each array member must be [ee, events...]')
    }
    const eventEmitter = arr[0]
    for (let j = 1; j < arr.length; j++) {
      const event = arr[j]
      const listener = ((event, callback) => {
        return function (arg1) {
          const args = new Array(arguments.length)
          const self = this
          const err = event === 'error'
            ? arg1
            : null
          // copy args to prevent arguments escaping scope
          for (let i = 0; i < args.length; i++) {
            args[i] = arguments[i]
          }
          done(err, self, event, args)
        }
      })(event, callback)
      // listen to the event
      eventEmitter.on(event, listener)
      // push this listener to the list of cleanups
      cleanups.push({
        ee: eventEmitter,
        event: event,
        fn: listener
      })
    }
  }

  function callback () {
    cleanup()
    done.apply(null, arguments)
  }

  function cleanup () {
    for (let i = 0; i < cleanups.length; i++) {
      let x = cleanups[i]
      x.ee.removeListener(x.event, x.fn)
    }
  }

  function thunk (fn) {
    /* istanbul ignore next */
    done = fn
  }
  thunk.cancel = cleanup
  return thunk
}
