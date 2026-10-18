/*   Folder pane
 **
 **  This outline pane lists the members of a folder
 */

import { authn } from 'solid-logic'
import type { PaneDefinition } from 'pane-registry'
import './components/folder-pane-view'
import FolderPaneCreateDialog from './components/folder-pane-storage-header/FolderPaneCreateDialog'
import type FolderPaneStorageHeader from './components/folder-pane-storage-header/FolderPaneStorageHeader'
import type FolderPaneView from './components/folder-pane-view/FolderPaneView'
import { aclControl, icons, ns, showDialog, widgets } from 'solid-ui'
import { getPaneLabel, isJavaScriptFile } from './helpers'
import { mintPaneInstance, PaneMintError, setMintStatus } from './mintPaneInstance'
import './styles/folderPane.css'
import './styles/utilities.css'

export { getCreationNoun, getCreationPanes, getPaneLabel } from './helpers'

type FolderPaneRenderOptions = {
  fullView?: boolean
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
    newPaneOptions.newInstance = kb.sym(u + '/')

    return kb.fetcher
      .webOperation('PUT', newInstance.uri)
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
    const kb = context.session.store
    const div = dom.createElement('div')
    div.classList.add('instancePane', 'folder-pane')
    const folderPaneView = div.appendChild(dom.createElement('folder-pane-view')) as FolderPaneView
    const renderOptions = paneOptions && typeof paneOptions === 'object'
      ? paneOptions as FolderPaneRenderOptions
      : {}
    folderPaneView.browserContext = context
    folderPaneView.subject = subject
    // `solo` only means "top-level navigation" in solid-panes, so it must not switch to full view.
    folderPaneView.fullView = renderOptions.fullView === true

    // The pane registry is needed to open the internal pane on Alt-click.
    // addDownstreamChangeListener is a high level function which when someone else changes the resource,
    // reloads it into the kb, then must call addDownstreamChangeListener to be able to update the folder pane.
    // SAM need to figure out how to add this line later kb.updater.addDownstreamChangeListener(subject, refresh) // Update store and call me if folder changes

    // Allow user to create new things within the folder
    const me = authn.currentUser() // @@ respond to login events
    if (!me) {
      return div // Cannot create new things without being logged in
    }

    void folderPaneView.updateComplete.then(() => {
      const storageHeader = folderPaneView.querySelector(
        'folder-pane-storage-header'
      ) as FolderPaneStorageHeader | null
      if (!storageHeader) return
      return storageHeader.updateComplete.then(() => {
        aclControl.preventBrowserDropEvents(dom)
        folderPaneView.addEventListener('folder-pane-upload', () => {
          const input = dom.createElement('input')
          input.type = 'file'
          input.multiple = true
          input.addEventListener('change', () => {
            if (input.files) droppedFileHandler(Array.from(input.files), folderPaneView.getActiveContainer() ?? subject)
          })
          input.click()
        })
        folderPaneView.addEventListener('folder-pane-create-pane', (event: Event) => {
          const pane = (event as CustomEvent<{ pane?: PaneDefinition }>).detail?.pane
          if (!pane?.mintNew) return
          const paneName = getPaneLabel(pane)
          const container = folderPaneView.getActiveContainer() ?? subject
          void new Promise<string | undefined>(resolve => {
            showDialog(FolderPaneCreateDialog, {
              props: { label: paneName },
              onClose: resolve
            })
          }).then(async name => {
            if (!name) return
            const statusArea = folderPaneView.statusArea
            if (!statusArea) throw new Error('Folder-pane view did not render a status area')
            folderPaneView.clearContentForCreation()
            const created = await mintPaneInstance({
              context,
              container,
              pane,
              name,
              noun: paneName,
              statusArea,
              me,
              dom
            })
            await folderPaneView.showCreatedResource({ container, ...created, pane })
          }).catch(error => {
            // mintPaneInstance has already reported mint failures in the status area.
            console.error('Unable to create folder-pane resource', error)
            const statusArea = folderPaneView.statusArea
            if (statusArea && !(error instanceof PaneMintError)) {
              setMintStatus(statusArea, 'error', `Unable to create ${paneName}: ${error instanceof Error ? error.message : String(error)}`)
            }
          })
        })
      })
    }).catch(error => {
      console.error('Unable to initialize folder-pane creation actions', error)
    })

    return div

    function droppedFileHandler (files, container = folderPaneView.getActiveContainer() ?? subject) {
      widgets.uploadFiles(
        kb.fetcher,
        files,
        container.uri,
        container.uri,
        function (_file, uri) {
          // A file has been uploaded
          const destination = kb.sym(uri)
          void folderPaneView.showCreatedResource({
            container,
            containedResource: destination
          })
        },
        function (_file, message) {
          const statusArea = folderPaneView.statusArea
          if (statusArea) setMintStatus(statusArea, 'error', message)
        }
      )
    }
  }
}
// ends
