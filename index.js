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

    this.open()
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
   * @param {?(Boolean)} [opts.closed = true]
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
    return this.list(opts).map(map).reduce(reduce, []).filter(filter)

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

        if (undefined !== value) {
          if ('string' === typeof value || value instanceof RegExp) {
            if (toRegex(value).test(resource[key])) {
              return true
            }
          }

          if (where[key] === resource[key]) {
            return true
          }

          if ('function' === typeof value) {
            if (false === value(resource[key], resource)) {
              return false
            }
          }

          return false
        }

        return true
      }
    }
  }

  /**
   * Waits for pool to be considered ready then calls `callback()`
   * @param {Function} callback
   */
  ready(callback) {
    const [ ...resources ] = this.list()
    const ready = new Batch()

    if ('function' !== typeof callback) {
      callback = () => void 0
    }

    if (this.closed || this.closing) {
      return process.nextTick(callback, new POOL_CLOSED_ERR())
    }

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
  add(resource) {
    const { close } = resource
    const resources = this[kResources]
    const defaultAllowActive = Boolean(this.allowActive)

    if (this.closed || this.closing) {
      throw new POOL_CLOSED_ERR()
    }

    this.guard.wait()
    resources.add(resource)

    resource.open((err) => {
      this.guard.continue()
    })

    return Object.assign(resource, {
      close: (allowActive, callback) => {
        if ('function' === typeof allowActive) {
          callback = allowActive
          allowActive = defaultAllowActive
        }

        if (2 === close.length) {
          return close.call(resource, allowActive, onclose)
        } else {
          return close.call(resource, onclose)
        }

        function onclose(err) {
          resources.delete(resource)
          if ('function' === typeof callback) {
            callback(err)
          }
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
      process.nextTick(callback)
    } else if (!this.closed && !this.closing) {
      if (!this.opening) {
        this.opening = true
        this.guard.ready(() => {
          this.opening = false
          this.opened = true
        })
      }
      this.guard.ready(callback)
    } else if (this.closed || this.closing) {
      return process.nextTick(callback, new POOL_CLOSED_ERR())
    }
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

    const closing = new Batch()

    if (!this.closing) {
      this.closing = true
      for (const resource of this[kResources]) {
        closing.push((next) => resource.close(allowActive, next))
      }
    }

    closing.end((err) => {
      callback(err)
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
