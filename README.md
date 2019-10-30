nanoresource-pool
=================

> Manage a pool of [nanoresource][nanoresource] instances.

<a name="installation"></a>
## Installation

```sh
$ npm install nanoresource-pool
```

## Status

> **Stable**

<a name="usage"></a>
## Usage

```js
const { Pool } = require('nanoresource-pool')

const pool = new Pool()

// add a resource
pool.add(resource)

// query all 'active' resources with a
// property called 'filename' with a value that matches '*.js'
pool.query({ filename: '*.js' })

// close pool and all resources when all resources are inactive
pool.close(callbackA)
```

<a name="example"></a>
## Example

Below is an example pool implementation of opened JavaScript and JSON files.

```js
const Resource = require('nanoresource')
const Pool = require('nanoresource-pool')
const fs = require('fs')

class File extends Resource {
  constructor(filename) {
    super()
    this.fd = 0
    this.filename = filename
  }

  _open(callback) {
    fs.open(this.filename, (err, fd) => {
      this.fd = fd
      callback(err)
    })
  }

  _close(callback) {
    fs.close(this.fd, callback)
  }
}

// `js`and `json` resources are based on the `File` class
const js = new Pool(File)
const json = new Pool(File)
const files = new Pool()

files.add(js)
files.add(json)

json.resource('package-lock.json')
json.resource('package.json')

js.resource('test.js')
js.resource('index.js')
js.resource('example.js')

files.ready(() => {
  // `query()` will search for resources in pool and
  // in child pools (recursively) using
  // static values, regular expression, and function
  // predcates to find something
  let results = null
  results = files.query({ filename: '*.js' }))
  results = files.query({ filename: (filename) => /.*.json/.test(filename) }))

  // will close all resources waiting after waiting for
  // all resources to be inactive
  files.close((err) => {
  })
})
```

<a name="api"></a>
## API

<a name="pool"></a>
### `pool = new Pool([Factory[, opts]])`

Creates a new `Pool` instance from `Factory` and `opts` where `Factory` is an
optional [nanoresource][nanoresource] constructor function and `opts` can be
an object like:

```js
{
  guard: NanoGuard(),
  allowActive: false,
  autoOpen: true, // if `false` you must call `pool.open()`
}
```

<a name="pool-opened"></a>
#### `pool.opened`

A `boolean` to indicated if the `Pool` is opened.

<a name="pool-opening"></a>
#### `pool.opening`

A `boolean` to indicated if the `Pool` is opening.

<a name="pool-closed"></a>
#### `pool.closed`

A `boolean` to indicated if the `Pool` is closed.

<a name="pool-closing"></a>
#### `pool.closing`

A `boolean` to indicated if the `Pool` is closing.

<a name="pool-allow-active"></a>
#### `pool.allowActive`

A default `boolean` value passed to each `resource.close()` method
call for resources when the pool closes.

<a name="pool-size"></a>
#### `pool.size`

The number of open and active resources. Accumlates
the size of any children pools added.

<a name="pool-actives"></a>
#### `pool.actives`

The number of active resource handles.

<a name="pool-list"></a>
#### `pool.list([opts])`

Get a list of resources, optionally filtering out
resources marked as "closed" or "closing" where `opts` can be:

```js
{
  closed: true
}
```

<a name="pool-ready"></a>
#### `pool.ready(callback)`

Waits for `pool` to be ready and calls `callback()` when it is.

<a name="pool-open"></a>
#### `pool.open([callback])`

Opens the pool. You only need to call this if `opts.autoOpen` was set to
`false` in the [`Pool` constructor](#pool).

<a name="pool-close"></a>
#### `pool.close([allowActive[, callback])`

Close pool and all added resources and child pools. Passes `allowActive`
directly to the all of the resource's `close()` methods. If you do not
provide the `allowActive` value, `pool.allowActive` will be used by
default.

<a name="pool-query"></a>
#### `pool.query([where[, opts[, callback]])`

Query for resources added to the pool. This function will also query any
added child pools on the instance.

<a name="pool-add"></a>
#### `pool.add(resource[, opts])`

Add a resource to the pool. Will remove from pool when the resource
successfully closes. Set `opts.autoOpen = false` to prevent the added
resource from automatically opening.

<a name="pool-resource"></a>
#### `pool.resource(...args)`

Acquire a new resource based on the pool factory constructor. (calls `new
pool.Factory(...args)`).

## License

MIT


[nanoresource]: https://github.com/mafintosh/nanoresource
