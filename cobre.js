(function () {
var Cobre = {};

Cobre._modules = {};

Cobre.$import = function $import (name) {
  var mod = Cobre._modules[name]
  if (!mod) throw new Error("module " + name + " not found")
  return mod
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

if (typeof window !== "undefined")
  window.Cobre = Cobre
if (typeof module !== "undefined")
  module.exports = Cobre
})();