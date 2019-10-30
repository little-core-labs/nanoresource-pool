const Resource = require('nanoresource')
const toRegex = require('to-regex')
const Guard = require('nanoguard')
const Batch = require('batch')

const kResources = Symbol('resources')

/**
 * The `POOL_CLOSED_ERR` is thrown when the `Pool` instance
 * is used after being closed.
 */
class POOL_CLOSED_ERR extends Error {
  constructor() {
    super('Pool is closed.')
  }
}

/**
 * The `Pool` class represents a container of `NanoResource` instances
 * that tracks the opening, closing, and active state of the resources
 * added to it.
 */
class Pool {

  /**
   * `Pool` class constructor.
   * @param {?(NanoResource)} Factory
   * @param {?(Object)} opts
   */
  constructor(Factory, opts) {
    if (Factory && 'object' === typeof Factory) {
      opts = Factory
      Factory = null
    }

    if (!opts || 'object' !== typeof opts) {
      opts = {}
    }

    this.guard = opts.guard || new Guard()
    this.opened = false
    this.closed = false
    this.opening = false
    this.closing = false
    this.Factory = Factory || Resource
    this[kResources] = new Set()
    this.allowActive = opts.allowActive || false

    if (false !== opts.autoOpen) {
      process.nextTick(() => this.open())
    }
  }

  /**
   * Returns the number of open and active resources. Accumlates
   * the size of any pools added
   * @accessor
   */
  get size() {
    const resources = [ ...this[kResources] ]
    const reduce = (total, r) => total + (r.size || 0)
    return resources.reduce(reduce, this[kResources].size)
  }

  /**
   * Returns the number of active resource handles.
   * @accessor
   */
  get actives() {
    const resources = [ ...this[kResources] ]
    const reduce = (total, r) => total + (r.actives || 0)
    return resources.reduce(reduce, 0)
  }

  /**
   * Returns a list of resources, optionally filtering out
   * resources marked as "closed" or "closing".
   * @param {?(Object)} opts
   * @param {?(Boolean)} [opts.closed = false]
   * @return {Array}
   */
  list(opts) {
    if (this.closed || this.closing) {
      throw new POOL_CLOSED_ERR()
    }

    if (!opts || 'object' !== typeof opts) {
      opts = {}
    }

    const resources = [ ...this[kResources] ]

    return resources.filter(filter)
    function filter(resource) {
      return true === opts.closed
        ? true
        : !resource.closed && !resource.closing
    }
  }

  /**
   * Queries list of resources in pool based on some
   * comparable input given by a `where` clause object. Child resources
   * added that are `Pool` instances will be queried with their results
   * flatted into the query response list.
   * @param {?(Object)} where
   * @param {?(Object)} opts
   */
  query(where, opts) {
    if (this.closed || this.closing) {
      throw new POOL_CLOSED_ERR()
    }

    where = Object.assign({}, where) // copy

    // convert to set then to array to remove any duplicate results
    return Array.from(new Set(
      this.list(opts).map(map).reduce(reduce, []).filter(filter)
    ))

    function map(item) {
      if ('function' === typeof item.query) {
        return item.query(where, opts)
      } else {
        return item
      }
    }

    function reduce(reduced, resources) {
      return reduced.concat(resources)
    }

    function filter(resource) {
      const keys = Object.keys(where)
      return Object.keys(where).every(every)

      function every(key) {
        let value = where[key]
        if ('string' === typeof where[key]) {
          value = value
            .replace(/^\*/g, '.*')
            .replace(/([a-z|A-Z|0-9|_|-|%|@]+)\*/g, '$1.*')
            .replace(/\/\*/g, '.*')
            .replace(/\\\\*/g, '.*')
        }

        if ('string' === typeof value || value instanceof RegExp) {
          if (toRegex(value).test(resource[key])) {
            return true
          }
        }

        if (where[key] === resource[key]) {
          return true
        }

        if ('function' === typeof value) {
          if (true === value(resource[key], resource)) {
            return true
          }
        }

        return false
      }
    }
  }

  /**
   * Waits for pool to be considered ready then calls `callback()`
   * @param {Function} callback
   */
  ready(callback) {
    if ('function' !== typeof callback) {
      callback = () => void 0
    }

    if (this.closed || this.closing) {
      return process.nextTick(callback, new POOL_CLOSED_ERR())
    }

    const [ ...resources ] = this.list()
    const ready = new Batch()

    for (const resource of resources) {
      if ('function' === typeof resource.ready) {
        ready.push((next) => resource.ready(next))
      }
    }

    ready.push((next) => this.guard.ready(next))
    ready.end((err) => callback(err))
  }

  /**
   * Adds a resource to the pool.
   * @param {NanoResource} resource
   */
  add(resource, opts) {
    if (!opts || 'object' !== typeof opts) {
      opts = {}
    }

    const { close } = resource
    const resources = this[kResources]
    const defaultAllowActive = Boolean(this.allowActive)

    if (this.closed || this.closing) {
      throw new POOL_CLOSED_ERR()
    }

    this.guard.wait()

    resources.add(resource)

    if (false === opts.autoOpen) {
      const { open } = resource
      resource.open = (callback) => {
        return open.call(resource, (err) => {
          if (err) {
            resources.delete(resource)
          }

          this.guard.continue()

          // istanbul ignore next
          if ('function' === typeof callback) {
            callback(err)
          }
        })
      }
    } else {
      resource.open((err) => {
        if (err) {
          resources.delete(resource)
        }

        this.guard.continue()
      })
    }

    return Object.assign(resource, {
      close(allowActive, callback) {
        if ('function' === typeof allowActive) {
          callback = allowActive
          allowActive = defaultAllowActive
        }

        if ('boolean' !== typeof allowActive) {
          allowActive = defaultAllowActive
        }

        if ('function' !== typeof callback) {
          callback = (err) => void err
        }

        return close.call(resource, allowActive, onclose)

        function onclose(err) {
          resources.delete(resource)
          callback(err)
        }
      }
    })
  }

  /**
   * Acquire a new resource based on the pool factory.
   * @param {...?(Mixed)} args
   * @return {NanoResource}
   */
  resource(...args) {
    if (this.closed || this.closing) {
      throw new POOL_CLOSED_ERR()
    }

    return this.add(new this.Factory(...args))
  }

  /**
   * Opens pool calling `callback` when opened ("ready").
   * @param {?(Function)} callback
  */
  open(callback) {
    if ('function' !== typeof callback) {
      callback = () => void 0
    }

    if (this.closed || this.closing) {
      return process.nextTick(callback, new POOL_CLOSED_ERR())
    }

    if (this.opened) {
      return process.nextTick(callback, null)
    }

    if (!this.opening) {
      this.opening = true
      this.guard.ready(() => {
        this.opening = false
        this.opened = true
      })
    }

    this.guard.ready(callback)
  }

  /**
   * Closes pool and all opened resources.
   * @param {?(Boolean)} allowActive
   * @param {?(Function)} callback
   */
  close(allowActive, callback) {
    if ('function' === typeof allowActive) {
      callback = allowActive
      allowActive = this.allowActive
    }

    if (this.closed || this.closing) {
      return process.nextTick(callback, new POOL_CLOSED_ERR())
    }

    this.closing = true

    const closing = new Batch()

    process.nextTick(() => {
      for (const resource of this[kResources]) {
        closing.push((next) => resource.close(allowActive, next))
      }
    })

    process.nextTick(() => {
      closing.end((err) => {
        this.closing = false
        this.closed = true

        process.nextTick(callback, err)
      })
    })
  }
}

/**
 * Default factory for creating `Pool` instances
 * backed with `NanoResource`.
 * @default
 * @param {?(NanoResource)} Factory
 * @param {?(Object)} opts
 * @return {Pool}
*/
function createPool(...args) {
  return new Pool(...args)
}

/**
 * Module exports.
 */
module.exports = Object.assign(createPool, {
  Pool
})
