/*   Folder pane
 **
 **  This outline pane lists the members of a folder
 */

import { authn } from 'solid-logic'
import * as UI from 'solid-ui'

export default {
  icon: UI.icons.iconBase + 'noun_973694_expanded.svg',
  name: 'folder',

  // Create a new folder in a Solid system,
  mintNew: function (context, newPaneOptions) {
    const kb = context.session.store
    const newInstance =
      newPaneOptions.newInstance || kb.sym(newPaneOptions.newBase)
    let u = newInstance.uri
    if (u.endsWith('/')) {
      u = u.slice(0, -1) // chop off trailer
    } // { throw new Error('URI of new folder must end in "/" :' + u) }
    newPaneOptions.newInstance = kb.sym(u + '/')

    return kb.fetcher
      .webOperation('PUT', newInstance.uri)
      .then(function () {
        console.log('New container created: ' + newInstance.uri)
        return newPaneOptions
      })
  },

  label: function (subject, context) {
    const kb = context.session.store
    const n = kb.each(subject, UI.ns.ldp('contains')).length
    if (n > 0) {
      return 'Contents (' + n + ')' // Show how many in hover text
    }
    if (kb.holds(subject, UI.ns.rdf('type'), UI.ns.ldp('Container'))) {
      // It is declared as being a container
      return 'Container (0)'
    }
    return null // Suppress pane otherwise
  },

  // Render a file folder in a LDP/solid system
  render: function (subject, context) {
    function noHiddenFiles (obj) {
      // @@ This hiddenness should actually be server defined
      const pathEnd = obj.uri.slice(obj.dir().uri.length)
      return !(
        pathEnd.startsWith('.') ||
        pathEnd.endsWith('.acl') ||
        pathEnd.endsWith('~')
      )
    }

    function refresh () {
      let objs = kb.each(subject, UI.ns.ldp('contains')).filter(noHiddenFiles)
      objs = objs.map(obj => [UI.utils.label(obj).toLowerCase(), obj])
      objs.sort() // Sort by label case-insensitive
      objs = objs.map(pair => pair[1])
      UI.utils.syncTableToArray(mainTable, objs, function (obj) {
        const st = kb.statementsMatching(subject, UI.ns.ldp('contains'), obj)[0]
        const defaultpropview = outliner.VIEWAS_boring_default
        const tr = outliner.propertyTR(dom, st, false)
        tr.firstChild.textContent = '' // Was initialized to 'Contains'
        tr.firstChild.style.cssText += 'min-width: var(--sui-space-2xl, 3em);'
        tr.appendChild(
          outliner.outlineObjectTD(obj, defaultpropview, undefined, st)
        )
        // UI.widgets.makeDraggable(tr, obj)
        return tr
      })
    }

    const dom = context.dom
    const outliner = context.getOutliner(dom)
    const kb = context.session.store
    let mainTable // This is a live synced table
    const div = dom.createElement('div')
    div.setAttribute('class', 'instancePane')
    const paneStyle = UI.style.folderPaneStyle || 'border-top: solid 1px var(--sui-border-color, #777); border-bottom: solid 1px var(--sui-border-color, #777); margin-top: var(--sui-space-md, 0.5em); margin-bottom: var(--sui-space-md, 0.5em);'
    div.setAttribute('style', paneStyle)
    
    const thisDir = subject.uri.endsWith('/') ? subject.uri : subject.uri + '/'
    const indexThing = kb.sym(thisDir + 'index.ttl#this')
    if (kb.holds(subject, UI.ns.ldp('contains'), indexThing.doc())) {
      console.log(
        'View of folder will be view of indexThing. Loading ' + indexThing
      )
      const packageDiv = div.appendChild(dom.createElement('div'))
      packageDiv.style.cssText = 'border-top: 0.2em solid var(--sui-border-color, #ccc);' // Separate folder views above from package views below
      kb.fetcher.load(indexThing.doc()).then(function () {
        mainTable = packageDiv.appendChild(dom.createElement('table'))
        context
          .getOutliner(dom)
          .GotoSubject(indexThing, true, undefined, false, undefined, mainTable)
      })
      return div
    } else {
      mainTable = div.appendChild(dom.createElement('table'))
      mainTable.refresh = refresh
      refresh()
      // addDownstreamChangeListener is a high level function which when someone else changes the resource,
      // reloads it into the kb, then must call addDownstreamChangeListener to be able to update the folder pane.
      kb.updater.addDownstreamChangeListener(subject, refresh) // Update store and call me if folder changes
    }

    // Allow user to create new things within the folder
    const creationDiv = div.appendChild(dom.createElement('div'))
    const me = authn.currentUser() // @@ respond to login events
    if (!me) {
      return div // Cannot create new things without being logged in
    }
    const creationContext: UI.createTypes.CreateContext = {
      folder: subject,
      div: creationDiv,
      dom: dom,
      statusArea: creationDiv,
      me: me
    }
    creationContext.refreshTarget = mainTable
    UI.login
      .filterAvailablePanes(context.session.paneRegistry.list)
      .then(function (relevantPanes) {
        UI.create.newThingUI(creationContext, context, relevantPanes) // Have to pass panes down  newUI

        UI.aclControl.preventBrowserDropEvents(dom)

        const explictDropIcon = false
        let target
        if (explictDropIcon) {
          const iconStyleFound = creationDiv.firstChild.style.cssText
          target = creationDiv.insertBefore(
            dom.createElement('img'),
            creationDiv.firstChild
          )
          target.style.cssText = iconStyleFound
          target.setAttribute('src', UI.icons.iconBase + 'noun_748003.svg')
          target.setAttribute('style', 'width: var(--sui-icon-size, 2em); height: var(--sui-icon-size, 2em);') // Safari says target.style is read-only
        } else {
          target = creationDiv.firstChild // Overload drop target semantics onto the plus sign
        }

        // /////////// Allow new file to be Uploaded
        UI.widgets.makeDropTarget(target, null, droppedFileHandler)
      })

    return div

    function droppedFileHandler (files) {
      UI.widgets.uploadFiles(
        kb.fetcher,
        files,
        subject.uri,
        subject.uri,
        function (file, uri) {
          // A file has been uploaded
          const destination = kb.sym(uri)
          console.log(' Upload: put OK: ' + destination)
          kb.add(subject, UI.ns.ldp('contains'), destination, subject.doc())
          mainTable.refresh()
        }
      )
    }
  }
}
// ends
