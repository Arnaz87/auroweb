(function () {

function $require (name) {
  if (typeof require !== "function") return null
  try { return require(name) }
  catch (e) {
    if (e.code === "MODULE_NOT_FOUND") return null
    else throw e
  }
}

var Cobre = {};

Cobre._modules = {};

function LazyModule (name) {
  var mod = null

  function getMod () {
    if (!mod) mod = Cobre._modules[name]
    if (!mod) throw new Error("module " + name + " not found")
    return mod
  }

  this.get = function (iname) {
    var item = null
    function getItem () { item = getMod().get(iname); return item }

    var fn = function () { (item || getItem()).apply(null, arguments) }

    var methods = ["test", "wrap", "unwrap"]
    for (var k in methods) {
      var pname = methods[k]
      fn[pname] = function () {
        (item || getItem())[pname].apply(item, arguments)
      }
    }

    return fn
  }
}

Cobre.$import = function $import (name) {
  return Cobre._modules[name] || new LazyModule(name)
}

Cobre.$export = function $export (name, mod) {
  if (Cobre._modules[name])
    console.warn("module " + name + " already exists")
  Cobre._modules[name] = mod
}

Cobre.Module = function Module (data) { this.data = data }
Cobre.Module.prototype.get = function get (name) {
  if (this.data instanceof Function)
    return this.data(name)
  return this.data[name]
}

Cobre.system = {
  exit: function () {
    if (typeof process !== "undefined") process.exit()
    else throw "Cobre Exit"
  },
  argv: (typeof argv !== "undefined")? argv : []
}

Cobre.Int = {}
Cobre.Bool = {}
Cobre.Any = {}
Cobre.Array = function (base) {}
Cobre.Record = function (fields) {}
Cobre.Function = function (ins, outs) {}

Cobre.String = {
  $new: function (buf) {
    if (typeof buf === "string") return buf
    var str = ""
    for (var i = 0; i < buf.length; i++)
      str += String.fromCharCode(buf[i])
    return decodeURIComponent(escape(str))
  },
  tobuf: function (str) {
    str = unescape(encodeURIComponent(str))
    var buf = new Uint8Array(str.length)
    for (var i = 0; i < str.length; i++)
      buf[i] = str.charCodeAt(i)
    return buf
  },
  charat: function (str, i) { return [str[i], i+1] }
}

var fs = $require("fs")
if (fs) Cobre.$export("cobre\x1fio", new Cobre.Module({
  r: function () {return "r"},
  w: function () {return "w"},
  a: function () {return "a"},
  open: function (path, mode) {
    return {f: fs.openSync(path, mode), size: fs.statSync(path).size, pos: 0}
  },
  close: function (file) { fs.closeSync(file.f) },
  read: function (file, size) {
    var buf = new Uint8Array(size)
    var redd = fs.readSync(file.f, buf, 0, size, file.pos)
    file.pos += redd
    return buf.slice(0, redd)
  },
  write: function (file, buf) {
    var written = fs.writeSync(file.f, buf, 0, buf.length, file.pos)
    file.pos += written
  },
  eof: function (file) { return file.pos >= file.size },
}))

if (typeof window !== "undefined")
  window.Cobre = Cobre
if (typeof module !== "undefined")
  module.exports = Cobre
})();