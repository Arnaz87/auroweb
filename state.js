
var reservedNames =  [
  // https://www.w3schools.com/js/js_reserved.asp
  "abstract", "await", "arguments", "boolean",
  "break", "byte", "case", "catch",
  "char", "class", "const", "continue",
  "debugger", "default", "delete", "do",
  "double", "else", "enum", "eval",
  "export", "extends", "false", "final",
  "finally", "float", "for", "function",
  "goto", "if", "implements", "import",
  "in", "instanceof", "int", "interface",
  "let", "long", "native", "new",
  "null", "package", "private", "protected",
  "public", "return", "short", "static",
  "super", "switch", "synchronized", "this",
  "throw", "throws", "transient", "true",
  "try", "typeof", "var", "void",
  "volatile", "while", "with", "yield",
  // Other keywords
  "undefined", "NaN", "Infinity",
  // Global Objects
  "Object", "Function", "Boolean", "Error", "Number", "Math", "String", "Array",
  // Browser specific
  "document", "window", "console",
  // NodeJS specific
  "global", "require", "module", "process", "Buffer",
  // Auro
  "Auro"
]


var nameSet = {}
reservedNames.forEach(function (name) { nameSet[name] = true })

var toCompile = []
var push = toCompile.push.bind(toCompile)
toCompile.push = function (val) { if (this.indexOf(val) < 0) push(val) }

exports.modules = {}
exports.nameSet = nameSet
exports.toCompile = toCompile
