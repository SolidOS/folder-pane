/*   Folder pane
 **
 **  This outline pane lists the members of a folder
 */

import { authn } from 'solid-logic'
import * as UI from 'solid-ui'
import './styles/folderPane.css'
import './styles/utilities.css'
import { FOLDER_CARD_TAG, FolderCard } from './components/FolderCard'
import { FOLDER_NAV_SIDEBAR_TAG, FolderNavSidebar } from './components/FolderNavSidebar'
import { FOLDER_BREADCRUMB_TAG, FolderBreadcrumb } from './components/FolderBreadcrumb'

// Display name for a contained resource, cleaned for regular (non-power,
// non-developer) users: trailing slash dropped for folders, file extension
// dropped for files. Power-user detail (URIs, MIME types) is intentionally
// not surfaced here.
function displayName (obj: { uri: string }): string {
  let last = obj.uri.replace(/\/+$/, '')
  last = last.slice(last.lastIndexOf('/') + 1)
  try {
    last = decodeURIComponent(last)
  } catch { /* leave as-is if not decodable */ }
  const isFolder = obj.uri.endsWith('/')
  if (!isFolder) {
    const dot = last.lastIndexOf('.')
    if (dot > 0) last = last.slice(0, dot) // strip extension
  }
  return last
}

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

    // Child containers whose contents we've already requested, so the lazy
    // count-loading below fires at most once per folder.
    const countLoadRequested = new Set<string>()

    function isContainer (obj) {
      return obj.uri.endsWith('/') ||
        kb.holds(obj, UI.ns.rdf('type'), UI.ns.ldp('Container')) ||
        kb.holds(obj, UI.ns.rdf('type'), UI.ns.ldp('BasicContainer'))
    }

    function refresh () {
      let objs = kb.each(subject, UI.ns.ldp('contains')).filter(noHiddenFiles)
      objs = objs.map(obj => [UI.utils.label(obj).toLowerCase(), obj])
      objs.sort() // Sort by label case-insensitive
      objs = objs.map(pair => pair[1])
<<<<<<< Updated upstream
      UI.utils.syncTableToArray(mainTable, objs, function (obj) {
        const st = kb.statementsMatching(subject, UI.ns.ldp('contains'), obj)[0]
        const defaultpropview = outliner.VIEWAS_boring_default
        const tr = outliner.propertyTR(dom, st, false)
        const predicateCell = tr.firstChild as HTMLElement
        predicateCell.textContent = '' // Was initialized to 'Contains'
        predicateCell.classList.add('folderPanePredicateCell')
        tr.appendChild(
          outliner.outlineObjectTD(obj, defaultpropview, undefined, st)
        )
        // UI.widgets.makeDraggable(tr, obj)
        return tr
=======
      // mainTable is a <div class="folder-card-grid"> of <folder-card>
      // web components — one per ldp:contains child. syncTableToArray works
      // on any parent's children, so it manages the cards identically to rows.
      UI.utils.syncTableToArray(mainTable, objs, function (obj) {
        const st = kb.statementsMatching(subject, UI.ns.ldp('contains'), obj)[0]
        const card = dom.createElement(FOLDER_CARD_TAG) as FolderCard
        ;(card as any).AJAR_statement = st
        card.name = displayName(obj)
        card.href = obj.uri
        card.kind = isContainer(obj) ? 'folder' : 'file'
        // Child count: number of resources inside this folder. The parent
        // listing doesn't carry it, so for sub-folders we lazily fetch the
        // child container once and update this card when it lands. (We update
        // the card directly rather than via refresh(), because syncTableToArray
        // reuses existing card elements and won't re-run this callback.)
        card.count = kb.each(obj, UI.ns.ldp('contains')).length
        if (isContainer(obj) && card.count === 0 && !countLoadRequested.has(obj.uri)) {
          countLoadRequested.add(obj.uri)
          kb.fetcher
            .load(obj)
            .then(() => {
              card.count = kb.each(obj, UI.ns.ldp('contains')).filter(noHiddenFiles).length
            })
            .catch(() => { /* unreadable child — leave at 0 */ })
        }
        // "Public" badge: anything living under a /public/ path segment is
        // world-readable in a Solid pod — a cheap, accurate signal that needs
        // no extra ACL fetch.
        card.isPublic = /\/public\//.test(obj.uri)
        // "Favorite" badge: driven by an optional ui:favorite triple, which
        // the parent container's .meta can carry (loaded with the folder).
        card.favorite = kb.holds(obj, UI.ns.ui('favorite'), true as any)
        return card
>>>>>>> Stashed changes
      })
    }

    const dom = context.dom
    const kb = context.session.store
    let mainTable // This is a live synced table
    const div = dom.createElement('div')
    div.classList.add('instancePane', 'folderPaneInstancePane')
    
    const thisDir = subject.uri.endsWith('/') ? subject.uri : subject.uri + '/'
    const indexThing = kb.sym(thisDir + 'index.ttl#this')
    if (kb.holds(subject, UI.ns.ldp('contains'), indexThing.doc())) {
      console.log(
        'View of folder will be view of indexThing. Loading ' + indexThing
      )
      const packageDiv = div.appendChild(dom.createElement('div'))
      packageDiv.classList.add('folderPanePackageDiv')
      kb.fetcher.load(indexThing.doc()).then(function () {
        mainTable = packageDiv.appendChild(dom.createElement('table'))
        mainTable.classList.add('folderPaneMainTable')
        context
          .getOutliner(dom)
          .GotoSubject(indexThing, true, undefined, false, undefined, mainTable)
      })
      return div
    } else {
<<<<<<< Updated upstream
      mainTable = div.appendChild(dom.createElement('table'))
      mainTable.classList.add('folderPaneMainTable')
      mainTable.refresh = refresh
      refresh()
=======
      // Breadcrumb (Figma node 1569:12509) — sits above the white card.
      // Always starts with "Dashboard" + "Home", then adds one crumb per
      // path segment between the conventional public/ home root and the
      // current container so deep folders show their full trail.
      const breadcrumb = div.appendChild(
        dom.createElement(FOLDER_BREADCRUMB_TAG)
      ) as FolderBreadcrumb
      const dashboardMatch = subject.uri.match(/^(https?:\/\/[^/]+\/[^/]+\/)/)
      const homeMatch = subject.uri.match(/^(https?:\/\/[^/]+\/[^/]+\/public\/)/)
      const homeRoot = homeMatch ? homeMatch[1] : (dashboardMatch ? dashboardMatch[1] : subject.uri)
      const crumbs: any[] = [
        { label: 'Dashboard', icon: 'grid', href: dashboardMatch ? dashboardMatch[1] : subject.uri },
        { label: 'Home', href: homeRoot }
      ]
      if (subject.uri.startsWith(homeRoot) && subject.uri !== homeRoot) {
        const tail = subject.uri.slice(homeRoot.length).replace(/\/+$/, '')
        const parts = tail.split('/').filter(Boolean)
        let acc = homeRoot
        for (const part of parts) {
          acc += part + '/'
          let label = part
          try { label = decodeURIComponent(part) } catch { /* keep raw */ }
          crumbs.push({ label, href: acc })
        }
      }
      breadcrumb.crumbs = crumbs

      // Two-column layout (Figma node 1569:12231): a navigation rail on the
      // left, the folder-card grid on the right.
      const layout = div.appendChild(dom.createElement('div'))
      layout.classList.add('folder-pane-layout')

      const sidebar = layout.appendChild(
        dom.createElement(FOLDER_NAV_SIDEBAR_TAG)
      ) as FolderNavSidebar
      // "Home" is the navigation root label (Figma node 1569:12243) — a stable
      // UX label for the tree root, not the literal folder name.
      sidebar.homeLabel = 'Home'
      sidebar.homeHref = subject.uri
      const pubMatch = subject.uri.match(/^(.*\/public\/)/)
      sidebar.publicHref = pubMatch ? pubMatch[1] : ''

      const mainCol = layout.appendChild(dom.createElement('div'))
      mainCol.classList.add('folder-pane-main')

      // Listing of LDP contents rendered as a grid of <folder-card> tiles.
      mainTable = mainCol.appendChild(dom.createElement('div'))
      mainTable.classList.add('folder-card-grid')
      mainTable.setAttribute('role', 'list')
      mainTable.setAttribute('aria-label', 'Contents of ' + (UI.utils.label(subject) || 'folder'))

      // Keep the sidebar's tree + favorites in sync with the listing: the
      // tree shows the current folder's sub-folders, favorites shows any
      // child carrying a ui:favorite triple.
      // The sidebar tree mirrors the pod folder hierarchy two levels deep
      // (matching Figma node 1569:12242). syncTreeRequested tracks which
      // sub-folders we've already kicked a load for.
      const syncTreeRequested = new Set<string>()

      // Sorted, de-duplicated child sub-folders of a container already in the
      // store. Lazily loading a child re-asserts its ldp:contains triple in a
      // second doc, so kb.each can return duplicates — dedup by URI.
      const childFolders = function (container) {
        const seen = new Set<string>()
        return kb.each(container, UI.ns.ldp('contains'))
          .filter(noHiddenFiles)
          .filter(c => (seen.has(c.uri) ? false : (seen.add(c.uri), true)))
          .filter(isContainer)
          .map(c => [UI.utils.label(c).toLowerCase(), c] as [string, any])
          .sort()
          .map(pair => pair[1])
      }

      const syncSidebar = function () {
        const seen = new Set<string>()
        const children = kb.each(subject, UI.ns.ldp('contains'))
          .filter(noHiddenFiles)
          .filter(c => (seen.has(c.uri) ? false : (seen.add(c.uri), true)))

        // Build a tree node for a sub-folder, recursing one level so the rail
        // shows nested folders (Figma shows e.g. Marketing Materials expanded).
        const buildNode = function (folder, depth) {
          const grandchildren = depth < 2 ? childFolders(folder) : []
          // Kick a one-off load so a deeper level can appear once it lands.
          if (depth < 2 && grandchildren.length === 0 && !syncTreeRequested.has(folder.uri)) {
            syncTreeRequested.add(folder.uri)
            kb.fetcher.load(folder).then(syncSidebar).catch(() => { /* unreadable */ })
          }
          return {
            name: displayName(folder),
            href: folder.uri,
            expanded: grandchildren.length > 0, // expand folders that hold folders
            children: grandchildren.map(g => buildNode(g, depth + 1))
          }
        }

        sidebar.tree = childFolders(subject).map(f => buildNode(f, 1))
        sidebar.favorites = children
          .filter(c => kb.holds(c, UI.ns.ui('favorite'), true as any))
          .map(c => ({ name: displayName(c), href: c.uri }))
        sidebar.requestUpdate()
      }

      const refreshAll = function () {
        refresh()
        syncSidebar()
      }
      mainTable.refresh = refreshAll
      refreshAll()
>>>>>>> Stashed changes
      // addDownstreamChangeListener is a high level function which when someone else changes the resource,
      // reloads it into the kb, then must call addDownstreamChangeListener to be able to update the folder pane.
      kb.updater.addDownstreamChangeListener(subject, refreshAll) // Update store and call me if folder changes
    }

    // Allow user to create new things within the folder
    const creationDiv = div.appendChild(dom.createElement('div'))
    creationDiv.classList.add('folderPaneCreationDiv')
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

        const explicitDropIcon = false
        let target
        if (explicitDropIcon) {
          target = creationDiv.insertBefore(
            dom.createElement('img'),
            creationDiv.firstChild
          )
          target.classList.add('folderPaneExplicitDropIcon')
          target.setAttribute('src', UI.icons.iconBase + 'noun_748003.svg')
        } else {
          target = creationDiv.firstChild // Overload drop target semantics onto the plus sign
        }

        if (target instanceof HTMLElement) {
          target.classList.add('folderPaneDropTarget')
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
