/*   Folder pane
 **
 **  This outline pane lists the members of a folder
 */

import { authn } from 'solid-logic'
import './styles/folderPane.css'
import './styles/utilities.css'
import './components/storage-pane-view/StoragePaneView'
import { aclControl, create, createTypes, icons, login, ns, widgets } from 'solid-ui'

export default {
  icon: icons.iconBase + 'noun_973694_expanded.svg',
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
        return newPaneOptions
      })
  },

  label: function (subject, context) {
    const kb = context.session.store
    const n = kb.each(subject, ns.ldp('contains')).length
    if (n > 0) {
      return 'Contents (' + n + ')' // Show how many in hover text
    }
    if (kb.holds(subject, ns.rdf('type'), ns.ldp('Container'))) {
      // It is declared as being a container
      return 'Container (0)'
    }
    return null // Suppress pane otherwise
  },

  // Render a file folder in a LDP/solid system
  render: function (subject, context) {


    const dom = context.dom
    const kb = context.session.store
    const outliner = context.getOutliner(dom)
    const div = dom.createElement('div')
    div.classList.add('instancePane', 'storage-pane')
    const storagePaneView = div.appendChild(dom.createElement('storage-pane-view'))
    storagePaneView.dom = dom
    storagePaneView.outliner = outliner
    storagePaneView.store = kb
    storagePaneView.subject = subject
    storagePaneView.resourceLogic = context.session.logic.resource

    // The pane registry is needed to open the internal pane on Alt-click.
    // addDownstreamChangeListener is a high level function which when someone else changes the resource,
    // reloads it into the kb, then must call addDownstreamChangeListener to be able to update the folder pane.
     // SAM need to figure out how to add this line later kb.updater.addDownstreamChangeListener(subject, refresh) // Update store and call me if folder changes

    // Allow user to create new things within the folder
    const creationDiv = div.appendChild(dom.createElement('div'))
    creationDiv.classList.add('storage-pane-creation-div')
    const me = authn.currentUser() // @@ respond to login events
    if (!me) {
      return div // Cannot create new things without being logged in
    }
    const creationContext: createTypes.CreateContext = {
      folder: subject,
      div: creationDiv,
      dom: dom,
      statusArea: creationDiv,
      me: me
    }
    // SAM creationContext.refreshTarget = contentView
    login
      // The available pane list includes the internal pane functionality used by the create-new UI.
      .filterAvailablePanes(context.session.paneRegistry.list)
      .then(function (relevantPanes) {
        create.newThingUI(creationContext, context, relevantPanes) // Have to pass panes down  newUI

        aclControl.preventBrowserDropEvents(dom)

        const explicitDropIcon = false
        let target
        if (explicitDropIcon) {
          target = creationDiv.insertBefore(
            dom.createElement('img'),
            creationDiv.firstChild
          )
          target.classList.add('storage-pane-explicit-drop-icon')
          target.setAttribute('src', icons.iconBase + 'noun_748003.svg')
        } else {
          target = creationDiv.firstChild // Overload drop target semantics onto the plus sign
        }

        if (target instanceof HTMLElement) {
          target.classList.add('storage-pane-drop-target')
        }

        creationDiv.classList.add('storage-pane-drop-zone')

        // /////////// Allow new file to be Uploaded
        widgets.makeDropTarget(creationDiv, null, droppedFileHandler)
      })

    return div

    function droppedFileHandler (files) {
      widgets.uploadFiles(
        kb.fetcher,
        files,
        subject.uri,
        subject.uri,
        function (file, uri) {
          // A file has been uploaded
          const destination = kb.sym(uri)
          kb.add(subject, ns.ldp('contains'), destination, subject.doc())
          // SAM how do we do this in the new code structure ... refresh()
        }
      )
    }
  }
}
// ends
