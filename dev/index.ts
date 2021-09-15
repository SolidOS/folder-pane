import { sym } from 'rdflib';
import { default as pane } from "../folderPane";
import { context, fetcher } from './context';
import { authn, widgets } from 'solid-ui';
import { Feature } from 'rdflib/lib/factories/factory-types';

const {
  currentSession,
  popupLogin,
  logout,
  trackSession
} = authn.solidAuthClient;

const loginButton = widgets.button(
  document,
  undefined,
  "Login",
  async function () {
    const session = await currentSession();
    const popupUri = "https://solidcommunity.net/common/popup.html";
    if (!session) {
      await popupLogin({ popupUri });
    }
  }
);

const logoutButton = widgets.button(document, undefined, "Logout", () => 
  logout()
);

const loginBanner = document.getElementById("loginBanner");

trackSession((session) => {
  if (!session) {
    loginBanner.innerHTML = "";
    loginBanner.appendChild(loginButton);
  } else {
    loginBanner.innerHTML = `Logged in as ${session.webId}`;
    loginBanner.appendChild(logoutButton);
  }
});

// Needs to be the uri of the addressBook
const webIdToShow = "https://sstratsianis.solidcommunity.net/profile/card#me"
const addressBookToShow = "https://sstratsianis.solidcommunity.net/private/Friends/index.ttl#this"
fetcher.load(webIdToShow).then(() => {

    const app = pane.render(sym(webIdToShow), context);
    document.getElementById("app").replaceWith(app)

})

