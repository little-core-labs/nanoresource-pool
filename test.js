const Resource = require('nanoresource')
const Guard = require('nanoguard')
const lucas = require('lucas-series')
const test = require('tape')

const createPool = require('./')
const { Pool } = require('./')

const fds = [ ...lucas(0, 32) ]

// doesn't actually do anything
class File extends Resource {
  constructor(filename) {
    super()
    this.filename = filename
    this.fd = 20 + fds.shift()
  }

  _open(callback) {
    callback(null)
  }

  _close(callback) {
    callback(null)
  }
}

test('createPool()', (t) => {
  const pool = createPool()
  t.ok(pool)
  t.ok(pool instanceof Pool)
  t.end()
})

test('new Pool()', (t) => {
  const pool = new Pool()
  t.ok(pool.guard)
  t.equal(false, pool.opened)
  t.equal(false, pool.opening)
  t.equal(false, pool.closed)
  t.equal(false, pool.closing)
  t.equal(Resource, pool.Factory)
  t.equal(false, pool.allowActive)
  t.equal(0, pool.size)
  t.equal(0, pool.actives)
  t.end()
})

test('new Pool(Factory)', (t) => {
  const pool = new Pool(File)
  t.equal(File, pool.Factory)
  t.end()
})

test('new Pool(opts)', (t) => {
  const guard = new Guard()
  const pool = new Pool({ guard, allowActive: true })
  t.equal(true, pool.allowActive)
  t.equal(guard, pool.guard)
  t.end()
})

test('pool.ready(callback)', (t) => {
  const pool = new Pool()
  pool.ready((err) => {
    t.notOk(err)
    t.pass('ready')
    t.end()
  })
})

test('pool.ready()', (t) => {
  const pool = new Pool()
  pool.ready()
  t.pass('ready()')
  t.end()
})

test('pool.ready(callback) - after close', (t) => {
  const pool = new Pool()
  pool.close(() => {
    pool.ready((err) => {
      t.ok(err)
      t.end()
    })
  })
})

test('pool.add(resource)', (t) => {
  const resource = new Resource()
  const pool = new Pool()

  t.ok(resource === pool.add(resource))
  t.end()
})

test('pool.add(resource) - bad resource', (t) => {
  const pool = new Pool()
  pool.add(new Resource({
    open(callback) {
      callback(new Error())
    }
  }))

  pool.ready(() => {
    t.equal(0, pool.size)
    t.end()
  })
})

test('pool.add(resource) - bad resource (opts.autoOpen = false)', (t) => {
  const pool = new Pool()
  const resource = pool.add(new Resource({
    open(callback) {
      callback(new Error())
    }
  }), { autoOpen: false })

  pool.ready(() => {
    t.equal(0, pool.size)
    t.end()
  })

  resource.open((err) => {
    t.ok(err)
  })
})

test('pool.add(resource) - after closed', (t) => {
  const pool = new Pool()
  pool.ready(() => {
    pool.close(() => {
      t.throws(() => pool.add(new Resource()))
      t.end()
    })
  })
})

test('pool.add(resource, opts) - opts.autoOpen = false', (t) => {
  const pool = new Pool()
  const resource = pool.add(new Resource(), { autoOpen: false })
  resource.open((err) => {
    t.error(err)
  })

  pool.ready(() => {
    t.end()
  })
})

test('pool.resource(...args)', (t) => {
  const pool = new Pool()
  const resource = pool.resource()
  t.ok(resource instanceof Resource)
  pool.resource({
    open(callback) {
      t.ok('function' === typeof callback)
      callback(null)
      process.nextTick(() => this.close())
    },

    close(callback) {
      t.ok('function' === typeof callback)
      callback(null)
      t.end()
    },
  })
})

test('pool.resource(...args) - after close', (t) => {
  const pool = new Pool()
  pool.open(() => {
    pool.close(() => {
      t.throws(() => pool.resource())
      t.end()
    })
  })
})

test('pool.open(callback)', (t) => {
  const pool = new Pool()
  pool.open((err) => {
    t.notOk(err)
    t.pass('open')
    t.end()
  })
})

test('pool.open(callback) - after close', (t) => {
  const pool = new Pool()
  pool.open((err) => {
    t.notOk(err)
    pool.close((err) => {
      pool.open((err) => {
        t.ok(err)
        t.end()
      })
    })
  })
})

test('pool.close(callback)', (t) => {
  const pool = new Pool()
  pool.open((err) => {
    pool.close((err) => {
      t.notOk(err)
      t.pass('close')
      t.end()
    })
  })
})

test('pool.close(allowActive, callback)', (t) => {
  const pool = new Pool()
  pool.open((err) => {
    const resource = pool.resource()
    pool.close(true, (err) => {
      t.notOk(err)
      t.pass('close')
      t.end()
    })
  })
})

test('pool.close(callback) - after closed', (t) => {
  const pool = new Pool()
  pool.open((err) => {
    pool.close((err) => {
      t.notOk(err)
      pool.close((err) => {
        t.ok(err)
        t.end()
      })
    })

    pool.close((err) => {
      t.ok(err)
    })
  })
})

test('resources = pool.list([opts])', (t) => {
  const pool = new Pool()
  pool.ready(() => {
    const first = pool.resource()
    const second = pool.resource()
    first.open(() => {
      first.close()
      t.equal(1, pool.list().length)
      t.equal(2, pool.list({closed: true}).length)
      t.end()
    })
  })
})

test('resources = pool.list() - after close', (t) => {
  const pool = new Pool()
  pool.close(() => {
    t.throws(() => pool.list())
    t.end()
  })
})

test('resources = pool.query([where[, opts]])', (t) => {
  const pool = new Pool()
  const json = new Pool(File)
  const js = new Pool(File)

  json.resource('package.json')
  json.resource('package-lock.json')
  js.resource('index.js')
  js.resource('test.js')

  pool.add(json)
  pool.add(js)

  pool.ready(() => {
    let results = pool.query()
    t.ok(Array.isArray(results))
    t.equal(4, results.length)

    results = pool.query({ filename: '*.js' })
    t.ok(Array.isArray(results))
    t.equal(2, results.length)

    results = pool.query({ fd: (fd) => fd > 22 })
    t.ok(Array.isArray(results))
    t.ok(results.length)

    results = pool.query({ filename: 'index.js' } )
    t.equal(1, results.length)
    t.equal('index.js', results[0].filename)

    results = pool.query({ fd: results[0].fd })
    t.equal(1, results.length)
    t.equal('index.js', results[0].filename)
    t.end()
  })
})

test('resources = pool.query() - after close', (t) => {
  const pool = new Pool()
  pool.close(() => {
    t.throws(() => pool.query())
    t.end()
  })
})

test('pool.size', (t) => {
  const pool = new Pool()
  t.equal(0, pool.size)
  let r = pool.resource()
  t.equal(1, pool.size)
  r.close(() => {
    t.equal(0, pool.size)
    pool.resource()
    pool.resource()
    pool.resource()
    t.equal(3, pool.size)
    pool.close(() => {
      t.equal(0, pool.size)
      t.end()
    })
  })
})

test('pool.actives', (t) => {
  const pool = new Pool()
  const child = new Pool()
  const first = pool.resource()
  const second  = child.resource()

  pool.add(child)
  second.active()
  t.equal(1, child.actives)
  t.equal(1, pool.actives)
  first.active()
  t.equal(2, pool.actives)
  second.inactive()
  t.equal(0, child.actives)
  t.equal(1, pool.actives)
  first.inactive()
  t.equal(0, pool.actives)
  t.end()
})

test('pool.open() - opts.autoOpen = false', (t) => {
  const pool = new Pool({ autoOpen: false })
  pool.open((err) => {
    t.error(err)
    t.pass('open')
    t.end()
  })
})
