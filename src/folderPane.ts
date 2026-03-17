/*   Folder pane
 **
 **  This outline pane lists the members of a folder
 */

import { authn, authSession } from 'solid-logic'
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
    let accessNoticeArea

    function showAccessNotice (message) {
      if (!accessNoticeArea) return
      accessNoticeArea.textContent = ''
      const note = accessNoticeArea.appendChild(dom.createElement('div'))
      note.style.cssText =
        'margin: 0.4em 0; padding: 0.55em 0.7em; border: 1px solid #d6c176; background: #fff9df; color: #5f4b00; border-radius: 0.3em; font-size: 95%;'
      note.textContent = message
    }

    function accessErrorMessage (error) {
      const text = String(error && (error.message || error))
      if (/\b401\b/.test(text)) {
        return 'This resource requires authentication. Log in with a WebID that has access and try again.'
      }
      return text
    }

    function renderErrorBlock (targetDiv, message) {
      const note = targetDiv.appendChild(dom.createElement('div'))
      note.style.cssText =
        'margin: 0.5em 0; padding: 0.6em; border: 1px solid #d6c176; background: #fff9df; color: #5f4b00; border-radius: 0.2em;'
      note.textContent = message
    }

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
      function bindLinkNavigationByUri (linkEl, uri) {
        linkEl.addEventListener(
          'click',
          function (event) {
            // Stop row-level handlers from hijacking the click.
            event.stopPropagation()
            event.stopImmediatePropagation()

            const manager =
              (window as any).document?.outlineManager ||
              (window as any).panes?.getOutliner?.()

            if (manager && typeof manager.GotoSubject === 'function') {
              event.preventDefault()
              manager.GotoSubject(kb.sym(uri), true, undefined, true, undefined)
              return
            }

            // No outline manager available in this host. Fall back to an
            // authenticated fetch and display the content in a new tab.
            event.preventDefault()
            const popup = window.open('', '_blank', 'noopener,noreferrer')
            authSession
              .fetch(uri)
              .then(function (response) {
                if (!response.ok) {
                  throw new Error('HTTP ' + response.status)
                }
                return response.blob().then(function (blob) {
                  const blobUrl = URL.createObjectURL(blob)
                  if (popup) {
                    popup.location.href = blobUrl
                    setTimeout(function () {
                      URL.revokeObjectURL(blobUrl)
                    }, 60000)
                  } else {
                    window.open(blobUrl, '_blank', 'noopener,noreferrer')
                  }
                })
              })
              .catch(function (error) {
                if (popup) {
                  popup.close()
                }
                console.warn('Authenticated open failed for ' + uri, error)
                showAccessNotice(
                  'Could not open this resource. Please confirm this WebID has read access.'
                )
              })
          },
          true
        )
      }

      let statements = kb.statementsMatching(subject, UI.ns.ldp('contains'))
      statements = statements.filter(st => noHiddenFiles(st.object))
      statements.sort(function (a, b) {
        return UI.utils
          .label(a.object)
          .toLowerCase()
          .localeCompare(UI.utils.label(b.object).toLowerCase())
      })

      if (typeof outliner.appendPropertyTRs === 'function') {
        console.log('Using outliner.appendPropertyTRs to render folder contents')
        while (mainTable.firstChild) {
          mainTable.removeChild(mainTable.firstChild)
        }
        outliner.appendPropertyTRs(mainTable, statements, false, null)

        const links = mainTable.querySelectorAll('a[href]')
        links.forEach(linkEl => {
          const link = linkEl as HTMLAnchorElement
          if (link.dataset.folderPaneBound === 'true') {
            return
          }
          link.dataset.folderPaneBound = 'true'
          const uri = link.getAttribute('href')
          if (uri) {
            bindLinkNavigationByUri(link, uri)
          }
        })
        return
      }

      const objs = statements.map(st => st.object)

      UI.utils.syncTableToArray(mainTable, objs, function (obj) {
        const tr = dom.createElement('tr')
        const predicateTd = tr.appendChild(dom.createElement('td'))
        predicateTd.textContent = ''
        predicateTd.style.cssText = 'min-width: 3em;'

        const objectTd = tr.appendChild(dom.createElement('td'))
        const iconLink = objectTd.appendChild(UI.widgets.linkIcon(dom, obj))
        bindLinkNavigationByUri(iconLink, obj.uri)

        const textLink = objectTd.appendChild(dom.createElement('a'))
        textLink.setAttribute('href', obj.uri)
        textLink.setAttribute('target', '_blank')
        textLink.setAttribute('rel', 'noopener noreferrer')
        textLink.textContent = UI.utils.label(obj)
        bindLinkNavigationByUri(textLink, obj.uri)
        return tr
      })
    }

    const dom = context.dom
    const outliner = context.getOutliner(dom)
    const kb = context.session.store
    let mainTable // This is a live synced table
    const div = dom.createElement('div')
    div.setAttribute('class', 'instancePane')
    const paneStyle = UI.style.folderPaneStyle || 'border-top: solid 1px #777; border-bottom: solid 1px #777; margin-top: 0.5em; margin-bottom: 0.5em;'
    div.setAttribute('style', paneStyle)
    accessNoticeArea = div.appendChild(dom.createElement('div'))
    
    const thisDir = subject.uri.endsWith('/') ? subject.uri : subject.uri + '/'
    const indexThing = kb.sym(thisDir + 'index.ttl#this')
    if (kb.holds(subject, UI.ns.ldp('contains'), indexThing.doc())) {
      console.log(
        'View of folder will be view of indexThing. Loading ' + indexThing
      )
      const packageDiv = div.appendChild(dom.createElement('div'))
      packageDiv.style.cssText = 'border-top: 0.2em solid #ccc;' // Separate folder views above from package views below
      kb.fetcher
        .load(indexThing.doc())
        .then(function () {
          mainTable = packageDiv.appendChild(dom.createElement('table'))
          context
            .getOutliner(dom)
            .GotoSubject(indexThing, true, undefined, false, undefined, mainTable)
        })
        .catch(function (error) {
          console.error('Error loading folder index: ' + indexThing.uri, error)
          renderErrorBlock(
            packageDiv,
            'Could not load folder index. ' + accessErrorMessage(error)
          )
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
          target.setAttribute('style', 'width: 2em; height: 2em') // Safari says target.style is read-only
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
