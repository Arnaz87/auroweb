
function Writer (text) {
  if (!(this instanceof Writer)) return new Writer()
  this.text = text || ""
  this._pre = ""
}

Writer.prototype.indent = function () { this._pre += "  "; }
Writer.prototype.dedent = function () { this._pre = this._pre.slice(2); }

Writer.prototype.write = function () {
  var line = this._pre;
  for (var i = 0; i < arguments.length; i++) {
    line += arguments[i];
  }
  this.text += line + "\n";
}

module.exports = Writer;
