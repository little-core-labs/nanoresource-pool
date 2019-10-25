const Resource = require('nanoresource')
const Pool = require('./')
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
  console.log(files.query({ filename: '*.js' }))
  console.log(files.query({ filename: '*.json' }))
  files.close(console.log)
})
