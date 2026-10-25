/*   Folder pane
 **
 **  This outline pane lists the members of a folder
 */

import './components/folder-pane-view'
import type FolderPaneView from './components/folder-pane-view/FolderPaneView'
import { icons, ns } from 'solid-ui'
import { isJavaScriptFile } from './helpers'
import './styles/folderPane.css'
import './styles/utilities.css'

export { getCreationNoun, getCreationPanes, getPaneLabel } from './helpers'

/**
 * How a folder is presented:
 * - `explorer`: storage header, sidebar and content (the viewer's own storage, the server root)
 * - `storage`: sidebar and content, under the navbar of someone else's pod
 * - `container`: the container alone (a container URL opened on its own)
 */
export type FolderView = 'explorer' | 'storage' | 'container'

type FolderPaneRenderOptions = {
  folderView?: FolderView
  fullView?: boolean
  solo?: boolean
}

const FOLDER_VIEWS: FolderView[] = ['explorer', 'storage', 'container']

export function folderViewFor (options: FolderPaneRenderOptions): FolderView {
  if (options.folderView && FOLDER_VIEWS.includes(options.folderView)) return options.folderView
  return options.fullView === true || options.solo === true ? 'container' : 'explorer'
}

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
    const normalizedInstance = kb.sym(u + '/')
    newPaneOptions.newInstance = normalizedInstance

    return kb.fetcher
      .webOperation('PUT', normalizedInstance.uri)
      .then(function () {
        return newPaneOptions
      })
  },

  label: function (subject, context) {
    if (isJavaScriptFile(subject)) return null
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
  render: function (subject, context, paneOptions?: unknown) {

    const dom = context.dom
    const div = dom.createElement('div')
    div.classList.add('instancePane', 'folder-pane')
    const folderPaneView = div.appendChild(dom.createElement('folder-pane-view')) as FolderPaneView
    const renderOptions = paneOptions && typeof paneOptions === 'object'
      ? paneOptions as FolderPaneRenderOptions
      : {}
    folderPaneView.browserContext = context
    folderPaneView.subject = subject
    const folderView = folderViewFor(renderOptions)
    folderPaneView.fullView = folderView === 'container'
    folderPaneView.hideStorageHeader = folderView === 'storage'

    // The pane registry is needed to open the internal pane on Alt-click.
    // addDownstreamChangeListener is a high level function which when someone else changes the resource,
    // reloads it into the kb, then must call addDownstreamChangeListener to be able to update the folder pane.
    // SAM need to figure out how to add this line later kb.updater.addDownstreamChangeListener(subject, refresh) // Update store and call me if folder changes

    return div
  }
}
// ends
