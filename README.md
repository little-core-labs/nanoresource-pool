nanoresource-pool
=================

> Manage a pool of [nanoresource][nanoresource] instances.

<a name="installation"></a>
## Installation

```sh
$ npm install nanoresource-pool
```

## Status

> **Testing/Documentation**

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
```

<a name=api"></a>
## API

<a name=pool"></a>
### `pool = new Pool([Factory[, opts]])`

Creates a new `Pool` instance from `Factory` and `opts` where `Factory` is an
optional [nanoresource][nanoresource] constructor function and `opts` can be
an object like:

```js
{
  guard: NanoGuard(),
  allowActive: false,
}
```

<a name=pool-opened"></a>
#### `pool.opened`

A `boolean` to indicated if the `Pool` is opened.

<a name=pool-opening"></a>
#### `pool.opening`

A `boolean` to indicated if the `Pool` is opening.

<a name=pool-closed"></a>
#### `pool.closed`

A `boolean` to indicated if the `Pool` is closed.

<a name=pool-closing"></a>
#### `pool.closing`

A `boolean` to indicated if the `Pool` is closing.

<a name=pool-allow-active"></a>
#### `pool.allowActive`

A default `boolean` value passed to each `resource.close()` method
call for resources when the pool closes.

<a name=pool-size"></a>
#### `pool.size`

The number of open and active resources. Accumlates
the size of any children pools added.

<a name=pool-actives"></a>
#### `pool.actives`

The number of active resource handles.

<a name=pool-list"></a>
#### `pool.list([opts])`

Get a list of resources, optionally filtering out
resources marked as "closed" or "closing" where `opts` can be:

```js
{
  closed: true
}
```

<a name=pool-ready"></a>
#### `pool.ready(callback)`

Waits for `pool` to be ready and calls `callback()` when it is.

<a name=pool-close"></a>
#### `pool.close([allowActive[, callback])`

Close pool and all added resources and child pools. Passes `allowActive`
directly to the all of the resource's `close()` methods. If you do not
provide the `allowActive` value, `pool.allowActive` will be used by
default.

<a name=pool-query"></a>
#### `pool.query([where[, opts[, callback]])

Query for resources added to the pool. This function will also query any
added child pools on the instance.

<a name=pool-add"></a>
#### `pool.add(resource)`

Add a resource to the pool. Will remove from pool when the resource
successfully closes.

<a name=pool-resource"></a>
#### `pool.resource(...args)`

Acquire a new resource based on the pool factory constructor. (calls `new
pool.Factory(...args)`).

## License

MIT


[nanoresource]: https://github.com/mafintosh/nanoresource
