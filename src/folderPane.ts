/*   Folder pane
 **
 **  This outline pane lists the members of a folder
 */

import './styles/folderPane.css'
import './styles/utilities.css'
import './components/storage-pane-view/StoragePaneView'
import { icons, ns } from 'solid-ui'

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
    return div
  }
}
// ends
