import { sym } from 'rdflib'
import pane from '../src/folderPane'
import './dev-global.css' // Import after src to override component styles
import { context, fetcher } from './context'
import { authn, authSession } from 'solid-logic'
import * as UI from 'solid-ui'

const loginBanner = document.getElementById('loginBanner')
const webId = document.getElementById('webId')

loginBanner.appendChild(UI.login.loginStatusBox(document, null, {}))

async function finishLogin () {
  await authSession.handleIncomingRedirect()
  const session = authSession
  if (session.info.isLoggedIn) {
    // Update the page with the status.
    webId.textContent = 'Logged in as: ' + authn.currentUser().uri
  } else {
    webId.textContent = ''
  }
}

finishLogin()

const targetURIToShow = "https://testingsolidos.solidcommunity.net/"

// Dev fallback: folderPane expects an outliner implementation from tabulator.
// The full outliner is not wired in this standalone harness, so provide a
// minimal adapter with just the members folderPane uses.
context.getOutliner = () => ({
  VIEWAS_boring_default: null,
  propertyTR: (dom) => {
    const tr = dom.createElement('tr')
    tr.appendChild(dom.createElement('td'))
    return tr
  },
  outlineObjectTD: (obj, _view, _unused, _st) => {
    const td = document.createElement('td')
    const a = document.createElement('a')
    a.href = obj.uri
    a.textContent = UI.utils.label(obj)
    a.target = '_blank'
    td.appendChild(a)
    return td
  },
  GotoSubject: (subject, _expand, _pane, _solo, _referrer, table) => {
    const tr = document.createElement('tr')
    const td = document.createElement('td')
    const a = document.createElement('a')
    a.href = subject.uri
    a.textContent = UI.utils.label(subject)
    a.target = '_blank'
    td.appendChild(a)
    tr.appendChild(td)
    table.appendChild(tr)
  }
})

fetcher.load(targetURIToShow).then(() => {
  const app = pane.render(sym(targetURIToShow), context)
  document.getElementById('app').replaceWith(app)
}).catch(error => {
  console.error('Error loading target URI:', error)
  const appElement = document.getElementById('app')
  if (appElement) {
    appElement.textContent = 'Error loading data. Please check the console for details.'
  }
})
