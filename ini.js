exports.parse = exports.decode = decode

exports.stringify = exports.encode = encode

exports.safe = safe
exports.unsafe = unsafe

var eol = typeof process !== 'undefined' &&
  process.platform === 'win32' ? '\r\n' : '\n'

function encode (obj, opt) {
  var children = []
  var out = ''

  if (typeof opt === 'string') {
    opt = {
      section: opt,
      whitespace: false
    }
  } else {
    opt = opt || {}
    opt.whitespace = opt.whitespace === true
  }

  var separator = opt.whitespace ? ' = ' : '='

  Object.keys(obj).forEach(function (k, _, __) {
    var val = obj[k]
    if (val && Array.isArray(val)) {
      val.forEach(function (item) {
        out += safe(k + '[]') + separator + safe(item) + '\n'
      })
    } else if (val && typeof val === 'object') {
      children.push(k)
    } else {
      out += safe(k) + separator + safe(val) + eol
    }
  })

  if (opt.section && out.length) {
    out = '[' + safe(opt.section) + ']' + eol + out
  }

  children.forEach(function (k, _, __) {
    var nk = dotSplit(k).join('\\.')
    var section = (opt.section ? opt.section + '.' : '') + nk
    var child = encode(obj[k], {
      section: section,
      whitespace: opt.whitespace
    })
    if (out.length && child.length) {
      out += eol
    }
    out += child
  })

  return out
}

function dotSplit (str) {
  return str.replace(/\1/g, '\u0002LITERAL\\1LITERAL\u0002')
    .replace(/\\\./g, '\u0001')
    .split(/\./).map(function (part) {
      return part.replace(/\1/g, '\\.')
      .replace(/\2LITERAL\\1LITERAL\2/g, '\u0001')
    })
}

var fieldType = {
  id: 1,
  name: 1,
  namespace: 1,
  def: 1,
  comment: 1,
  created_by: 1,
  creation_date: 1,
  is_obsolete: 1,
  intersection_of: 2,
  synonym: 2,
  alt_id: 2,
  subset: 2,
  xref: 2,
  consider: 3,
  relationship: 3,
  is_a: 3
};

function extractRelationships(obj) {
  let relationships={};
  var re = /\s*!\s.*/;
  var re2 = /(\S+)\s(\S+)/;
  Object.keys(obj).forEach(section => {
    let idx={};
    relationships[section] = [];
    obj[section].forEach(item => {
      idx[item.id] = item;
      if (item.is_a) {
        item.is_a.forEach(id => {
          relationships[section].push({
            type: 'IS_A',
            source: item.id,
            target: id.replace(re,'')
          });
        })
        delete item.is_a;
      }
      if (item.consider) {
        item.consider.forEach(id => {
          relationships[section].push({
            type: 'CONSIDER',
            source: item.id,
            target: id
          })
        })
        delete item.consider;
      }
      if (item.relationship) {
        item.relationship.forEach(rel => {
          rel = rel.replace(re,'');
          var match = rel.match(re2);
          if (!match) return;
          relationships[section].push({
            type: match[1].toUpperCase(),
            source: item.id,
            target: match[2]
          })
        })
        delete item.relationship;
      }
    })
  });
  obj.relationships = relationships;
  return obj;
}

function decode (str) {
  var out = {}
  var p = out
  var section = null
  //          section     |key      : value
  var re = /^\[([^\]]*)\]$|^([^:]+)(:(.*))?$/i
  var lines = str.split(/[\r\n]+/g)

  lines.forEach(function (line, _, __) {
    if (!line || line.match(/^\s*[;#]/)) return
    var match = line.match(re)
    if (!match) return
    if (match[1] !== undefined) {
      section = unsafe(match[1])
      if(!out[section]) {
        out[section] = []
      }
      p = {};
      out[section].push(p)
      return
    }
    var key = unsafe(match[2])
    if (!fieldType[key]) return
    var value = match[3] ? unsafe(match[4]) : true
    switch (value) {
      case 'true':
      case 'false':
      case 'null': value = JSON.parse(value)
    }

    // Convert keys with '[]' suffix to an array
    if (fieldType[key] > 1) {
      if (!p[key]) {
        p[key] = []
      } else if (!Array.isArray(p[key])) {
        p[key] = [p[key]]
      }
    }

    // safeguard against resetting a previously defined
    // array by accidentally forgetting the brackets
    if (Array.isArray(p[key])) {
      p[key].push(value)
    } else {
      p[key] = value
    }
  })

  return extractRelationships(out);
}

function isQuoted (val) {
  return (val.charAt(0) === '"' && val.slice(-1) === '"') ||
    (val.charAt(0) === "'" && val.slice(-1) === "'")
}

function safe (val) {
  return (typeof val !== 'string' ||
    val.match(/[=\r\n]/) ||
    val.match(/^\[/) ||
    (val.length > 1 &&
     isQuoted(val)) ||
    val !== val.trim())
      ? JSON.stringify(val)
      : val.replace(/;/g, '\\;').replace(/#/g, '\\#')
}

function unsafe (val, doUnesc) {
  val = (val || '').trim()
  if (isQuoted(val)) {
    // remove the single quotes before calling JSON.parse
    if (val.charAt(0) === "'") {
      val = val.substr(1, val.length - 2)
    }
    try { val = JSON.parse(val) } catch (_) {}
  } else {
    // walk the val to find the first not-escaped ; character
    var esc = false
    var unesc = ''
    for (var i = 0, l = val.length; i < l; i++) {
      var c = val.charAt(i)
      if (esc) {
        if ('\\;#'.indexOf(c) !== -1) {
          unesc += c
        } else {
          unesc += '\\' + c
        }
        esc = false
      } else if (';#'.indexOf(c) !== -1) {
        break
      } else if (c === '\\') {
        esc = true
      } else {
        unesc += c
      }
    }
    if (esc) {
      unesc += '\\'
    }
    return unesc.trim()
  }
  return val
}
