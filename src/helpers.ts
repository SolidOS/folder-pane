function noHiddenFiles (obj) {
  // @@ This hiddenness should actually be server defined
  const pathEnd = obj.uri.slice(obj.dir().uri.length)
  return !(
    pathEnd.startsWith('.') ||
    pathEnd.endsWith('.acl') ||
    pathEnd.endsWith('~')
  )
}

export { noHiddenFiles }
